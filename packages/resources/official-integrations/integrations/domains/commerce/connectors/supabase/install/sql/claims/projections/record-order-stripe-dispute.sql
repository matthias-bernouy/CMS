

create or replace function commerce.record_order_stripe_dispute_projection(
    p_order_public_id uuid,
    p_provider_event_id text,
    p_provider_dispute_id text,
    p_status text,
    p_reason text,
    p_amount bigint,
    p_currency text,
    p_opened_at timestamptz,
    p_occurred_at timestamptz,
    p_evidence_due_by timestamptz default null,
    p_provider_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_dispute commerce.stripe_dispute_projections%rowtype;
    v_recovery_authorization commerce.settlement_release_authorizations%rowtype;
    v_event_id bigint;
    v_open boolean;
    v_funds_withdrawn boolean;
    v_recovery_amount bigint;
    v_recovery_revision integer;
begin
    select * into v_order from commerce.orders where public_id = p_order_public_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id for update;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    if p_amount <= 0 or p_amount > v_terms.buyer_total_amount or lower(p_currency) <> v_terms.currency then
        raise exception 'conflict: Stripe dispute does not match Commerce payment terms';
    end if;
    v_funds_withdrawn := coalesce((p_provider_snapshot->>'fundsWithdrawn')::boolean, false);
    v_event_id := commerce.claim_provider_projection_event(
        'stripe', p_provider_event_id, v_order.id,
        'stripe_dispute.' || p_status, p_occurred_at,
        jsonb_strip_nulls(jsonb_build_object(
            'providerDisputeId', p_provider_dispute_id,
            'reason', p_reason, 'amount', p_amount, 'currency', lower(p_currency),
            'openedAt', p_opened_at, 'evidenceDueBy', p_evidence_due_by,
            'fundsWithdrawn', v_funds_withdrawn,
            'snapshot', coalesce(p_provider_snapshot, '{}'::jsonb)
        ))
    );
    if v_event_id is null then
        select * into v_dispute from commerce.stripe_dispute_projections
        where provider_dispute_id = p_provider_dispute_id;
        return to_jsonb(v_dispute) || jsonb_build_object('idempotentReplay', true);
    end if;
    select * into v_dispute from commerce.stripe_dispute_projections
    where provider_dispute_id = p_provider_dispute_id for update;
    if found and (
        v_dispute.order_id <> v_order.id or v_dispute.amount <> p_amount
        or v_dispute.currency <> lower(p_currency)
        or (v_dispute.status in ('won', 'lost', 'prevented', 'warning_closed')
            and v_dispute.status <> p_status)
    ) then
        update commerce.order_settlements set
            status = 'manual_review', manual_review_reason = 'stripe_dispute_projection_regression'
        where order_id = v_order.id;
        insert into commerce.financial_exceptions (
            order_id, kind, severity, reason, details
        ) values (
            v_order.id, 'provider_dispute', 'critical',
            'Stripe dispute projection changed attach-once or terminal facts',
            jsonb_build_object('providerDisputeId', p_provider_dispute_id,
                'previousStatus', v_dispute.status, 'nextStatus', p_status)
        );
        perform commerce.append_financial_event(
            v_order.id, 'stripe_dispute', p_provider_dispute_id, 'stripe_dispute_regression',
            'provider', 'stripe', p_reason, jsonb_build_object('providerEventId', p_provider_event_id),
            'commerce.stripe_dispute.regression', 'stripe:' || p_provider_event_id || ':regression'
        );
        return to_jsonb(v_dispute) || jsonb_build_object(
            'accepted', false, 'idempotentReplay', false,
            'reason', 'provider_dispute_changed_terminal_or_attach_once_facts'
        );
    end if;
    insert into commerce.stripe_dispute_projections (
        order_id, provider_dispute_id, status, reason, amount, currency,
        evidence_due_by, funds_withdrawn, provider_snapshot, opened_at, closed_at
    ) values (
        v_order.id, p_provider_dispute_id, p_status, p_reason, p_amount,
        lower(p_currency), p_evidence_due_by, v_funds_withdrawn,
        coalesce(p_provider_snapshot, '{}'::jsonb), p_opened_at,
        case when p_status in ('won', 'lost', 'prevented', 'warning_closed')
            and not v_funds_withdrawn then p_occurred_at end
    ) on conflict (provider_dispute_id) do update set
        status = excluded.status, reason = excluded.reason, amount = excluded.amount,
        evidence_due_by = excluded.evidence_due_by,
        funds_withdrawn = excluded.funds_withdrawn,
        provider_snapshot = excluded.provider_snapshot,
        closed_at = excluded.closed_at, updated_at = now()
    returning * into v_dispute;
    v_open := p_status not in ('won', 'prevented', 'warning_closed') or v_funds_withdrawn;
    if v_open then
        update commerce.order_settlements set
            status = case
                when status = 'manual_review' then status
                when total_transferred_amount > total_reversed_amount then 'reversal_pending'
                else 'blocked'
            end,
            manual_review_reason = case
                when status = 'manual_review' then manual_review_reason
                else 'stripe_dispute_' || p_status
            end
        where order_id = v_order.id;
        insert into commerce.financial_exceptions (
            order_id, kind, severity, reason, details
        ) values (
            v_order.id, 'provider_dispute', 'critical',
            'Stripe dispute requires independent provider handling',
            jsonb_build_object('providerDisputeId', p_provider_dispute_id, 'status', p_status)
        );
        if v_settlement.total_transferred_amount > v_settlement.total_reversed_amount then
            perform commerce.record_seller_financial_exposure(
                v_order.id, 'chargeback:' || p_provider_dispute_id, 'chargeback',
                case when p_status = 'lost' then 'debt' else 'at_risk' end,
                least(p_amount, v_settlement.total_transferred_amount - v_settlement.total_reversed_amount),
                0, case when p_status = 'lost'
                    then 'Stripe chargeback was lost before seller funds were fully recovered'
                    else 'Open Stripe dispute exposes transferred seller funds' end,
                jsonb_build_object('providerDisputeId', p_provider_dispute_id, 'status', p_status)
            );
        end if;
    elsif p_status in ('won', 'prevented', 'warning_closed')
        and not exists (select 1 from commerce.marketplace_claims where order_id = v_order.id
            and status not in ('resolved_buyer', 'resolved_seller', 'resolved_split'))
        and not exists (select 1 from commerce.refund_requests where order_id = v_order.id
            and status not in ('rejected', 'cancelled', 'failed', 'succeeded')) then
        update commerce.order_settlements set
            status = case when total_transferred_amount > total_reversed_amount then 'released' else 'held' end,
            manual_review_reason = null
        where order_id = v_order.id
          and status <> 'manual_review'
          and (manual_review_reason is null or manual_review_reason like 'stripe_dispute_%');
    end if;
    if p_status in ('won', 'prevented', 'warning_closed') and not v_funds_withdrawn then
        update commerce.seller_financial_exposures set
            recovered_amount = amount, status = 'recovered',
            reason = 'Stripe dispute closed without seller debt', updated_at = now()
        where exposure_key = 'chargeback:' || p_provider_dispute_id
          and status in ('at_risk', 'debt');
        perform commerce.refresh_seller_risk_state(v_order.seller_id);
    end if;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    if not v_open
        and v_settlement.status <> 'manual_review'
        and not exists (select 1 from commerce.marketplace_claims where order_id = v_order.id
            and status not in ('resolved_buyer', 'resolved_seller', 'resolved_split'))
        and not exists (select 1 from commerce.refund_requests where order_id = v_order.id
            and status not in ('rejected', 'cancelled', 'failed', 'succeeded'))
        and not exists (select 1 from commerce.stripe_dispute_projections
            where order_id = v_order.id
              and (status not in ('won', 'prevented', 'warning_closed') or funds_withdrawn)) then
        v_recovery_amount := greatest(
            0,
            v_settlement.authorized_seller_amount
                - v_settlement.seller_reserve_liability_remaining_amount
                - (v_settlement.total_transferred_amount - v_settlement.total_reversed_amount)
        );
        if v_recovery_amount > 0 then
            perform commerce.assert_order_seller_risk(v_order.id, 'dispute recovery release');
            select * into v_recovery_authorization
            from commerce.settlement_release_authorizations release_auth
            where release_auth.order_id = v_order.id
              and release_auth.release_kind = 'recovery'
              and release_auth.status in ('authorized', 'provider_pending')
            order by release_auth.recovery_revision desc limit 1;
            if not found then
                select coalesce(max(recovery_revision), 0) + 1 into v_recovery_revision
                from commerce.settlement_release_authorizations
                where order_id = v_order.id and release_kind = 'recovery';
                insert into commerce.settlement_release_authorizations (
                    order_id, business_key, release_kind, recovery_revision,
                    authorized_amount, currency, financial_terms_hash,
                    authorized_by_kind, authorized_by, reason
                ) values (
                    v_order.id,
                    'settlement:' || v_order.id || ':recovery:' || v_recovery_revision
                        || ':dispute:' || p_provider_dispute_id
                        || ':reversed:' || v_settlement.total_reversed_amount,
                    'recovery', v_recovery_revision, v_recovery_amount,
                    v_terms.currency, v_terms.financial_terms_hash,
                    'system', 'stripe-reconciliation',
                    'Stripe dispute closed safely after seller Transfer recovery'
                ) returning * into v_recovery_authorization;
                perform commerce.append_financial_event(
                    v_order.id, 'release_authorization', v_recovery_authorization.id::text,
                    'dispute_recovery_release_authorized', 'system', 'stripe-reconciliation', null,
                    jsonb_build_object('authorizedAmount', v_recovery_authorization.authorized_amount,
                        'providerDisputeId', p_provider_dispute_id,
                        'recoveryRevision', v_recovery_authorization.recovery_revision),
                    'commerce.settlement.recovery_release_authorized',
                    'release:' || v_recovery_authorization.id || ':authorized'
                );
            elsif v_recovery_authorization.authorized_amount <> v_recovery_amount then
                update commerce.order_settlements set
                    status = 'manual_review',
                    manual_review_reason = 'dispute_recovery_release_amount_mismatch'
                where order_id = v_order.id;
                raise exception 'conflict: active dispute recovery release amount changed';
            end if;
            update commerce.order_settlements set status = 'release_pending', manual_review_reason = null
            where order_id = v_order.id;
        end if;
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'stripe_dispute', p_provider_dispute_id,
        'stripe_dispute_' || p_status, 'provider', 'stripe', p_reason,
        jsonb_build_object('providerEventId', p_provider_event_id, 'amount', p_amount),
        'commerce.stripe_dispute.projection', 'stripe:' || p_provider_event_id
    );
    return to_jsonb(v_dispute) || jsonb_build_object(
        'recoveryReleaseAuthorization', case when v_recovery_authorization.id is null then null
            else jsonb_build_object(
                'releaseAuthorizationId', v_recovery_authorization.id,
                'releaseKind', v_recovery_authorization.release_kind,
                'recoveryRevision', v_recovery_authorization.recovery_revision,
                'amount', v_recovery_authorization.authorized_amount,
                'businessKey', v_recovery_authorization.business_key
            ) end,
        'idempotentReplay', false
    );
end;
$$;