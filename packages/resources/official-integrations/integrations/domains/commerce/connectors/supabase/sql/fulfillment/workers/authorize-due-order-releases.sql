

create or replace function commerce.authorize_due_order_releases(
    p_run_key text,
    p_limit integer default 25
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_candidate record;
    v_authorizations jsonb := '[]'::jsonb;
    v_authorization jsonb;
    v_limit integer;
    v_claimed integer;
begin
    if p_run_key is null or length(btrim(p_run_key)) = 0 then
        raise exception 'validation: release run key is required';
    end if;
    v_limit := least(greatest(p_limit, 1), 100);
    insert into commerce.financial_operation_dispatch_claims (
        operation_kind, operation_id, order_id
    )
    select 'release', release_auth.id::text, release_auth.order_id
    from commerce.settlement_release_authorizations release_auth
    where release_auth.status in ('authorized', 'provider_pending')
    on conflict (operation_kind, operation_id) do nothing;
    with candidates as (
        select dispatch.operation_kind, dispatch.operation_id
        from commerce.financial_operation_dispatch_claims dispatch
        join commerce.settlement_release_authorizations release_auth
          on release_auth.id::text = dispatch.operation_id
        join commerce.order_settlements settlement on settlement.order_id = release_auth.order_id
        where dispatch.operation_kind = 'release'
          and release_auth.status in ('authorized', 'provider_pending')
          and settlement.status = 'release_pending'
          and dispatch.available_at <= now()
          and (dispatch.claimed_at is null
            or dispatch.claimed_at < now() - interval '5 minutes')
        order by dispatch.available_at, dispatch.created_at, dispatch.operation_id
        limit v_limit
        for update of dispatch skip locked
    ), claimed as (
        update commerce.financial_operation_dispatch_claims dispatch set
            claimed_at = now(),
            claimed_by = 'release-worker:' || p_run_key,
            attempts = attempts + 1
        from candidates
        where dispatch.operation_kind = candidates.operation_kind
          and dispatch.operation_id = candidates.operation_id
        returning dispatch.operation_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'status', 'authorized',
        'releaseAuthorizationId', release_auth.id,
        'orderId', order_row.id,
        'orderPublicId', order_row.public_id,
        'paymentId', payment.provider_payment_id,
        'businessKey', release_auth.business_key,
        'releaseKind', release_auth.release_kind,
        'sellerId', seller.cms_user_id,
        'sellerRequiredMinimumBalanceAmount', coalesce(
            risk_state.outstanding_debt_amount + risk_state.at_risk_exposure_amount, 0
        ),
        'payoutDelayDays', risk.payout_delay_days,
        'amount', release_auth.authorized_amount,
        'currency', upper(release_auth.currency),
        'financialTermsHash', release_auth.financial_terms_hash
    ) order by release_auth.created_at, release_auth.id), '[]'::jsonb)
    into v_authorizations
    from claimed dispatch
    join commerce.settlement_release_authorizations release_auth
      on release_auth.id::text = dispatch.operation_id
    join commerce.orders order_row on order_row.id = release_auth.order_id
    join commerce.sellers seller on seller.id = order_row.seller_id
    join commerce.order_financial_terms terms on terms.order_id = order_row.id
    join commerce.seller_risk_policies risk on risk.id = terms.seller_risk_policy_id
    left join commerce.seller_risk_states risk_state on risk_state.seller_id = seller.id
    join lateral (
        select attempt.provider_payment_id
        from commerce.order_payment_attempts attempt
        where attempt.order_id = release_auth.order_id and attempt.status = 'succeeded'
        order by attempt.created_at desc limit 1
    ) payment on true;
    v_claimed := jsonb_array_length(v_authorizations);
    for v_candidate in
        select settlement.order_id, settlement.version
        from commerce.order_settlements settlement
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = settlement.order_id
        where settlement.status in ('reserve_held', 'held', 'eligible')
          and settlement.total_transferred_amount = 0
          and not exists (
              select 1 from commerce.settlement_release_authorizations existing
              where existing.order_id = settlement.order_id and existing.release_kind = 'initial'
          )
          and fulfillment.status = 'collected_by_recipient'
          and fulfillment.blocking_reason is null
          and fulfillment.release_eligible_at <= now()
          and exists (
              select 1 from commerce.delivery_reconciliation_health health
              where health.id = 'mondial-relay'
                and health.checked_at >= now() - interval '30 minutes'
          )
          and exists (
              select 1 from commerce.delivery_order_reconciliation_health health
              where health.order_id = settlement.order_id
                and health.checked_at >= now() - interval '30 minutes'
                and health.shipment_id <> ''
                and health.provider_reference = fulfillment.provider_reference
                and health.shipment_status = 'collected_by_recipient'
                and health.pending_projection_count = 0
                and health.manual_review_count = 0
                and health.tracking_error_count = 0
                and health.tracking_checked_at is not null
          )
        order by fulfillment.release_eligible_at, settlement.order_id
        limit greatest(v_limit - v_claimed, 0)
        for update of settlement skip locked
    loop
        begin
            v_authorization := commerce.authorize_order_release(
                v_candidate.order_id, 'system', 'release-worker:' || p_run_key,
                'Claim window expired without an open blocker', v_candidate.version
            );
            insert into commerce.financial_operation_dispatch_claims (
                operation_kind, operation_id, order_id, claimed_at, claimed_by, attempts
            ) values (
                'release', v_authorization->>'releaseAuthorizationId', v_candidate.order_id,
                now(), 'release-worker:' || p_run_key, 1
            ) on conflict (operation_kind, operation_id) do update set
                claimed_at = excluded.claimed_at,
                claimed_by = excluded.claimed_by,
                attempts = commerce.financial_operation_dispatch_claims.attempts + 1;
            v_authorizations := v_authorizations || jsonb_build_array(v_authorization);
        exception when others then
            insert into commerce.financial_exceptions (
                order_id, kind, severity, reason, details
            ) values (
                v_candidate.order_id, 'settlement_ambiguity', 'high',
                'Due release authorization failed closed',
                jsonb_build_object('runKey', p_run_key, 'error', sqlerrm)
            );
        end;
    end loop;
    v_claimed := jsonb_array_length(v_authorizations);
    for v_candidate in
        select settlement.order_id, settlement.version
        from commerce.order_settlements settlement
        join commerce.order_financial_terms terms on terms.order_id = settlement.order_id
        join commerce.seller_risk_policies risk on risk.id = terms.seller_risk_policy_id
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = settlement.order_id
        where settlement.status in ('reserve_held', 'held', 'eligible')
          and settlement.seller_reserve_liability_remaining_amount > 0
          and settlement.total_transferred_amount - settlement.total_reversed_amount
              >= settlement.authorized_seller_amount
                  - settlement.seller_reserve_liability_remaining_amount
          and fulfillment.release_eligible_at + make_interval(days => risk.reserve_liability_days) <= now()
          and not exists (
              select 1 from commerce.settlement_release_authorizations existing
              where existing.order_id = settlement.order_id and existing.release_kind = 'reserve'
          )
        order by fulfillment.release_eligible_at, settlement.order_id
        limit greatest(v_limit - v_claimed, 0)
        for update of settlement skip locked
    loop
        begin
            v_authorization := commerce.authorize_order_reserve_release(
                v_candidate.order_id, 'reserve-worker:' || p_run_key,
                'Seller reserve holding period expired without an open blocker',
                v_candidate.version
            );
            insert into commerce.financial_operation_dispatch_claims (
                operation_kind, operation_id, order_id, claimed_at, claimed_by, attempts
            ) values (
                'release', v_authorization->>'releaseAuthorizationId', v_candidate.order_id,
                now(), 'release-worker:' || p_run_key, 1
            ) on conflict (operation_kind, operation_id) do update set
                claimed_at = excluded.claimed_at,
                claimed_by = excluded.claimed_by,
                attempts = commerce.financial_operation_dispatch_claims.attempts + 1;
            v_authorizations := v_authorizations || jsonb_build_array(v_authorization);
        exception when others then
            insert into commerce.financial_exceptions (
                order_id, kind, severity, reason, details
            ) values (
                v_candidate.order_id, 'risk_hold', 'high',
                'Seller reserve release failed closed',
                jsonb_build_object('runKey', p_run_key, 'error', sqlerrm)
            );
        end;
    end loop;
    return jsonb_build_object('runKey', p_run_key, 'authorizations', v_authorizations);
end;
$$;