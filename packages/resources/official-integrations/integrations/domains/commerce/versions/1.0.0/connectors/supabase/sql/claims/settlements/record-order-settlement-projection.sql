

create or replace function commerce.record_order_settlement_projection(
    p_order_public_id uuid,
    p_provider_event_id text,
    p_operation_type text,
    p_provider_operation_id bigint,
    p_status text,
    p_amount bigint,
    p_currency text,
    p_occurred_at timestamptz,
    p_release_authorization_id uuid default null,
    p_refund_request_id bigint default null,
    p_refund_business_key text default null,
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
    v_authorization commerce.settlement_release_authorizations%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_payment_cancellation commerce.payment_cancellation_requests%rowtype;
    v_event_id bigint;
    v_prior_event commerce.provider_projection_events%rowtype;
    v_prior_status text;
    v_gross_remainder bigint;
    v_required_recovery bigint;
begin
    if p_operation_type not in ('transfer', 'reversal', 'refund') then
        raise exception 'validation: unsupported settlement operation type';
    end if;
    if p_status not in ('reserved', 'processing', 'pending', 'succeeded', 'failed', 'cancelled', 'manual_review') then
        raise exception 'validation: unsupported settlement provider status';
    end if;
    if p_provider_operation_id is null or p_provider_operation_id <= 0 then
        raise exception 'validation: provider operation id is required';
    end if;
    select * into v_order from commerce.orders where public_id = p_order_public_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id for update;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    if lower(p_currency) <> v_terms.currency or p_amount <= 0 then
        raise exception 'conflict: provider settlement amount or currency is invalid';
    end if;
    v_event_id := commerce.claim_provider_projection_event(
        'stripe', p_provider_event_id, v_order.id,
        p_operation_type || '.' || p_status, p_occurred_at,
        jsonb_strip_nulls(jsonb_build_object(
            'providerOperationId', p_provider_operation_id,
            'amount', p_amount, 'currency', lower(p_currency),
            'releaseAuthorizationId', p_release_authorization_id,
            'commerceRefundRequestId', p_refund_request_id,
            'refundRequestId', p_refund_business_key,
            'snapshot', coalesce(p_provider_snapshot, '{}'::jsonb)
        ))
    );
    if v_event_id is null then
        return to_jsonb(v_settlement) || jsonb_build_object('idempotentReplay', true);
    end if;
    select * into v_prior_event from commerce.provider_projection_events event
    where event.authority = 'stripe' and event.id <> v_event_id
      and event.event_type like p_operation_type || '.%'
      and (event.payload->>'providerOperationId')::bigint = p_provider_operation_id
    order by event.occurred_at desc, event.id desc limit 1;
    if found then
        v_prior_status := split_part(v_prior_event.event_type, '.', 2);
        if v_prior_event.order_id <> v_order.id
            or (v_prior_event.payload->>'amount')::bigint <> p_amount
            or v_prior_event.payload->>'currency' <> lower(p_currency)
            or v_prior_event.payload->>'releaseAuthorizationId' is distinct from p_release_authorization_id::text
            or v_prior_event.payload->>'commerceRefundRequestId' is distinct from p_refund_request_id::text
            or v_prior_event.payload->>'refundRequestId' is distinct from p_refund_business_key then
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = p_operation_type || '_attach_once_mismatch'
            where order_id = v_order.id returning * into v_settlement;
            insert into commerce.financial_exceptions (order_id, kind, severity, reason, details)
            values (
                v_order.id, 'settlement_ambiguity', 'critical',
                'Provider operation changed attach-once settlement facts',
                jsonb_build_object('providerOperationId', p_provider_operation_id,
                    'operationType', p_operation_type)
            );
            perform commerce.append_financial_event(
                v_order.id, p_operation_type, p_provider_operation_id::text,
                p_operation_type || '_attach_once_mismatch', 'provider', 'stripe', null,
                jsonb_build_object('providerEventId', p_provider_event_id),
                'commerce.order.settlement_mismatch', 'stripe:' || p_provider_event_id || ':mismatch'
            );
            return to_jsonb(v_settlement) || jsonb_build_object(
                'orderPublicId', v_order.public_id, 'accepted', false,
                'idempotentReplay', false, 'reason', 'provider_operation_attach_once_mismatch'
            );
        end if;
        if v_prior_status = 'succeeded' then
            return to_jsonb(v_settlement) || jsonb_build_object(
                'orderPublicId', v_order.public_id,
                'idempotentReplay', false, 'idempotentOperationReplay', p_status = 'succeeded',
                'ignoredStaleEvent', p_status <> 'succeeded'
            );
        end if;
        if v_prior_status in ('failed', 'cancelled') and p_status <> v_prior_status then
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = p_operation_type || '_terminal_regression'
            where order_id = v_order.id returning * into v_settlement;
            insert into commerce.financial_exceptions (order_id, kind, severity, reason, details)
            values (
                v_order.id, 'settlement_ambiguity', 'critical',
                'Provider operation regressed from a terminal failure',
                jsonb_build_object('providerOperationId', p_provider_operation_id,
                    'previousStatus', v_prior_status, 'nextStatus', p_status)
            );
            perform commerce.append_financial_event(
                v_order.id, p_operation_type, p_provider_operation_id::text,
                p_operation_type || '_terminal_regression', 'provider', 'stripe', null,
                jsonb_build_object('providerEventId', p_provider_event_id),
                'commerce.order.settlement_regression', 'stripe:' || p_provider_event_id || ':regression'
            );
            return to_jsonb(v_settlement) || jsonb_build_object(
                'orderPublicId', v_order.public_id, 'accepted', false,
                'idempotentReplay', false, 'reason', 'provider_operation_terminal_regression'
            );
        end if;
    end if;

    if p_operation_type = 'transfer' then
        select * into v_authorization from commerce.settlement_release_authorizations
        where id = p_release_authorization_id and order_id = v_order.id for update;
        if not found then raise exception 'conflict: release authorization is missing'; end if;
        if p_amount <> v_authorization.authorized_amount then
            raise exception 'conflict: transfer exceeds Commerce release authorization';
        end if;
        if not exists (
            select 1 from commerce.order_payment_attempts
            where order_id = v_order.id and status = 'succeeded' and provider_charge_id is not null
        ) then raise exception 'conflict: transfer requires a confirmed source charge'; end if;
        update commerce.settlement_release_authorizations set
            status = case p_status
                when 'succeeded' then 'confirmed'
                when 'failed' then 'failed'
                when 'manual_review' then 'manual_review'
                else 'provider_pending' end
        where id = v_authorization.id;
        if p_status = 'succeeded' then
            if v_settlement.total_transferred_amount + p_amount - v_settlement.total_reversed_amount
                > v_settlement.authorized_seller_amount then
                raise exception 'conflict: cumulative transfers exceed authorized seller amount';
            end if;
            update commerce.order_settlements set
                total_transferred_amount = total_transferred_amount + p_amount,
                seller_reserve_liability_remaining_amount = case
                    when v_authorization.release_kind = 'reserve'
                        then greatest(0, seller_reserve_liability_remaining_amount - p_amount)
                    else seller_reserve_liability_remaining_amount end,
                provider_transfer_id = p_provider_operation_id,
                status = case
                    when total_transferred_amount + p_amount - total_reversed_amount
                        = authorized_seller_amount
                        and (v_authorization.release_kind = 'reserve'
                            or seller_reserve_liability_remaining_amount = 0)
                        then 'released'
                    when v_authorization.release_kind in ('initial', 'recovery')
                        and seller_reserve_liability_remaining_amount > 0 then 'reserve_held'
                    else 'held' end,
                manual_review_reason = null
            where order_id = v_order.id returning * into v_settlement;
            if v_authorization.release_kind = 'reserve' then
                perform commerce.record_seller_financial_exposure(
                    v_order.id, 'reserve:' || v_order.id, 'reserve', 'recovered',
                    v_terms.seller_reserve_liability_amount,
                    v_terms.seller_reserve_liability_amount,
                    'Seller reserve released after the holding period',
                    jsonb_build_object('providerOperationId', p_provider_operation_id)
                );
            end if;
            update commerce.orders set status = 'completed'
            where id = v_order.id and status = 'active'
              and v_settlement.status in ('reserve_held', 'released');
        elsif p_status in ('failed', 'cancelled', 'manual_review') then
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = 'transfer_' || p_status
            where order_id = v_order.id returning * into v_settlement;
        end if;
    elsif p_operation_type = 'reversal' then
        if p_amount + v_settlement.total_reversed_amount > v_settlement.total_transferred_amount then
            raise exception 'conflict: cumulative reversals exceed transferred amount';
        end if;
        if p_status = 'succeeded' then
            update commerce.order_settlements set
                total_reversed_amount = total_reversed_amount + p_amount,
                status = case when total_reversed_amount + p_amount = total_transferred_amount
                    then 'reversed' else 'reversal_pending' end
            where order_id = v_order.id returning * into v_settlement;
        elsif p_status in ('reserved', 'processing', 'pending') then
            update commerce.order_settlements set status = 'reversal_pending'
            where order_id = v_order.id returning * into v_settlement;
        else
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = 'reversal_' || p_status
            where order_id = v_order.id returning * into v_settlement;
            perform commerce.record_seller_financial_exposure(
                v_order.id, 'reversal:' || p_provider_operation_id,
                'reversal_failure', 'debt', p_amount, 0,
                'Provider could not recover a transferred seller balance',
                jsonb_build_object('providerOperationId', p_provider_operation_id,
                    'providerStatus', p_status)
            );
        end if;
    else
        select * into v_refund from commerce.refund_requests
        where id = p_refund_request_id
          and business_key = p_refund_business_key
          and order_id = v_order.id for update;
        if not found then raise exception 'conflict: refund request is missing'; end if;
        if p_amount <> v_refund.requested_amount then
            raise exception 'conflict: provider refund amount differs from Commerce request';
        end if;
        if v_refund.status not in ('approved', 'provider_operation_reserved', 'processing', 'manual_review')
            and p_status <> 'failed' then
            raise exception 'conflict: refund request is not provider-authorized';
        end if;
        update commerce.refund_requests set
            status = case p_status
                when 'reserved' then 'provider_operation_reserved'
                when 'processing' then 'processing'
                when 'pending' then 'processing'
                when 'succeeded' then 'succeeded'
                when 'failed' then 'failed'
                when 'cancelled' then 'failed'
                else 'manual_review' end,
            provider_refund_id = p_provider_operation_id,
            provider_operation_key = coalesce(provider_operation_key, business_key),
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb)
        where id = v_refund.id returning * into v_refund;
        if p_status = 'succeeded' then
            select least(
                v_settlement.total_transferred_amount,
                coalesce(sum(request.seller_recovery_amount - request.seller_reserve_offset_amount), 0)
            ) into v_required_recovery
            from commerce.refund_requests request
            where request.order_id = v_order.id and request.status = 'succeeded';
            if v_settlement.total_reversed_amount < v_required_recovery then
                raise exception 'conflict: refund requires confirmed seller recovery reversal';
            end if;
            if v_settlement.total_refunded_amount + p_amount > v_terms.buyer_total_amount then
                raise exception 'conflict: cumulative refunds exceed captured buyer total';
            end if;
            update commerce.order_settlements set
                total_refunded_amount = total_refunded_amount + p_amount,
                authorized_seller_amount = greatest(
                    total_transferred_amount - total_reversed_amount,
                    authorized_seller_amount - v_refund.seller_recovery_amount
                ),
                seller_reserve_liability_remaining_amount = greatest(
                    0, seller_reserve_liability_remaining_amount - v_refund.seller_reserve_offset_amount
                ),
                status = case
                    when total_refunded_amount + p_amount = v_terms.buyer_total_amount then 'refunded'
                    else 'held' end,
                manual_review_reason = null
            where order_id = v_order.id returning * into v_settlement;
            if v_refund.seller_reserve_offset_amount > 0 then
                update commerce.seller_financial_exposures set
                    recovered_amount = least(amount, recovered_amount + v_refund.seller_reserve_offset_amount),
                    status = case when recovered_amount + v_refund.seller_reserve_offset_amount >= amount
                        then 'recovered' else status end,
                    reason = 'Seller reserve offset against an authorized buyer refund',
                    updated_at = now()
                where exposure_key = 'reserve:' || v_order.id;
                perform commerce.refresh_seller_risk_state(v_order.seller_id);
            end if;
            update commerce.marketplace_claims set
                status = case resolution_outcome when 'buyer' then 'resolved_buyer' else 'resolved_split' end,
                resolved_at = now()
            where id = v_refund.claim_id and status = 'resolution_pending';
            if v_refund.claim_id is not null then
                update commerce.orders set status = 'completed'
                where id = v_order.id and status = 'active'
                  and exists (
                      select 1
                      from commerce.marketplace_claims claim
                      where claim.id = v_refund.claim_id
                        and claim.status in ('resolved_buyer', 'resolved_split')
                  );
            else
                select * into v_payment_cancellation
                from commerce.payment_cancellation_requests
                where order_id = v_order.id and status = 'refund_pending'
                order by created_at desc, id desc limit 1 for update;
                if found then
                    update commerce.payment_cancellation_requests set status = 'completed'
                    where id = v_payment_cancellation.id;
                    update commerce.order_cancellation_requests set status = 'completed'
                    where order_id = v_order.id and status = 'refund_pending';
                    perform commerce.restore_order_inventory(v_order.id);
                    update commerce.orders set status = v_payment_cancellation.target_order_status
                    where id = v_order.id and status = 'cancellation_pending';
                    update commerce.financial_exceptions set
                        status = 'resolved', resolved_at = now(), resolved_by = 'protected-refund'
                    where deduplication_key = v_refund.business_key and status <> 'resolved';
                elsif exists (
                    select 1 from commerce.order_cancellation_requests
                    where order_id = v_order.id and status = 'refund_pending'
                ) then
                    update commerce.order_cancellation_requests set status = 'completed'
                    where order_id = v_order.id and status = 'refund_pending';
                    perform commerce.restore_order_inventory(v_order.id);
                    update commerce.orders set status = 'cancelled' where id = v_order.id;
                end if;
            end if;
        elsif p_status in ('failed', 'cancelled', 'manual_review') then
            update commerce.order_settlements set
                status = 'manual_review', manual_review_reason = 'refund_' || p_status
            where order_id = v_order.id returning * into v_settlement;
        end if;
    end if;
    v_gross_remainder := v_terms.buyer_total_amount - v_settlement.total_refunded_amount
        - (v_settlement.total_transferred_amount - v_settlement.total_reversed_amount)
        - v_settlement.seller_reserve_liability_remaining_amount;
    if v_gross_remainder < 0 then
        raise exception 'conflict: settlement projection violates gross conservation';
    end if;
    update commerce.order_settlements set platform_gross_remainder_amount = v_gross_remainder
    where order_id = v_order.id returning * into v_settlement;
    if p_status in ('failed', 'cancelled', 'manual_review') then
        insert into commerce.financial_exceptions (
            order_id, kind, severity, reason, details
        ) values (
            v_order.id,
            case p_operation_type when 'refund' then 'refund_failure' else 'settlement_ambiguity' end,
            'critical', p_operation_type || ' provider operation is ' || p_status,
            jsonb_build_object('providerOperationId', p_provider_operation_id, 'amount', p_amount)
        );
    end if;
    perform commerce.append_financial_event(
        v_order.id, p_operation_type, p_provider_operation_id::text,
        p_operation_type || '_' || p_status, 'provider', 'stripe', null,
        jsonb_build_object('providerEventId', p_provider_event_id, 'amount', p_amount),
        'commerce.order.settlement_projection', 'stripe:' || p_provider_event_id
    );
    return to_jsonb(v_settlement) || jsonb_build_object(
        'orderPublicId', v_order.public_id,
        'refundRequest', case when v_refund.id is null then null else to_jsonb(v_refund) end,
        'idempotentReplay', false
    );
end;
$$;