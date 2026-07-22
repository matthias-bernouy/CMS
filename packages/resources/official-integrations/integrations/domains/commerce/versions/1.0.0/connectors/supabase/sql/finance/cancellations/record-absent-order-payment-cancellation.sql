

create or replace function commerce.record_absent_order_payment_cancellation(
    p_order_public_id uuid,
    p_provider_event_id text,
    p_cancellation_request_id text,
    p_occurred_at timestamptz,
    p_provider_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_cancellation commerce.payment_cancellation_requests%rowtype;
    v_event_id bigint;
begin
    if nullif(btrim(p_cancellation_request_id), '') is null then
        raise exception 'validation: cancellation request id is required';
    end if;
    select * into v_order
    from commerce.orders
    where public_id = p_order_public_id
    for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_cancellation
    from commerce.payment_cancellation_requests
    where order_id = v_order.id
      and business_key = p_cancellation_request_id
    for update;
    if not found then raise exception 'conflict: payment cancellation request does not match Commerce authority'; end if;
    v_event_id := commerce.claim_provider_projection_event(
        'stripe', p_provider_event_id, v_order.id, 'payment.absent', p_occurred_at,
        jsonb_build_object(
            'cancellationRequestId', p_cancellation_request_id,
            'providerPaymentAbsent', true,
            'snapshot', coalesce(p_provider_snapshot, '{}'::jsonb)
        )
    );
    if v_event_id is null then
        return jsonb_build_object(
            'orderId', v_order.id,
            'status', v_cancellation.status,
            'providerPaymentAbsent', true,
            'idempotentReplay', true
        );
    end if;
    if exists (
        select 1 from commerce.order_payment_attempts attempt
        where attempt.order_id = v_order.id
    ) then
        raise exception 'conflict: absent provider truth cannot finalize an order with a payment attempt';
    end if;
    if v_cancellation.status not in ('requested', 'processing', 'completed') then
        raise exception 'conflict: payment cancellation is not awaiting absent provider truth';
    end if;
    if v_cancellation.status <> 'completed' then
        update commerce.payment_cancellation_requests
        set status = 'completed',
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb)
                || jsonb_build_object('providerPaymentAbsent', true)
        where id = v_cancellation.id
        returning * into v_cancellation;
        perform commerce.restore_order_inventory(v_order.id);
        update commerce.orders
        set status = v_cancellation.target_order_status,
            version = version + 1,
            updated_at = now()
        where id = v_order.id and status = 'cancellation_pending';
        update commerce.order_fulfillments
        set status = 'cancelled',
            blocking_reason = case
                when v_cancellation.target_order_status = 'expired' then 'payment_window_expired'
                else 'order_cancelled_before_payment' end,
            version = version + 1,
            updated_at = now()
        where order_id = v_order.id;
        update commerce.order_settlements
        set status = 'blocked',
            manual_review_reason = case
                when v_cancellation.target_order_status = 'expired' then 'order_expired_without_provider_payment'
                else 'order_cancelled_without_provider_payment' end,
            version = version + 1,
            updated_at = now()
        where order_id = v_order.id;
        update commerce.order_cancellation_requests
        set status = 'completed'
        where id = v_cancellation.order_cancellation_request_id
          and status = 'provider_cancellation_pending';
        update commerce.financial_exceptions
        set status = 'resolved', resolved_at = now(), resolved_by = 'stripe-payment-absent'
        where deduplication_key = 'deadline:payment:' || v_order.id
          and status <> 'resolved';
        insert into commerce.platform_payout_order_liabilities (
            order_id, lifecycle_status, risk_release_at
        ) values (
            v_order.id, 'released', null
        ) on conflict (order_id) do update set
            lifecycle_status = 'released', risk_release_at = null, updated_at = now();
        perform commerce.refresh_platform_payout_liability_delta(
            array[v_order.id],
            'Provider-absent payment cancellation released prospective liability', null
        );
        perform commerce.append_financial_event(
            v_order.id, 'payment_cancellation', v_cancellation.id::text,
            'payment_cancellation_provider_absent', 'provider', 'stripe', null,
            jsonb_build_object(
                'cancellationRequestId', p_cancellation_request_id,
                'targetOrderStatus', v_cancellation.target_order_status
            ),
            'commerce.order.payment_cancellation_absent',
            v_cancellation.business_key || ':provider-absent'
        );
    end if;
    return jsonb_build_object(
        'orderId', v_order.id,
        'status', v_cancellation.status,
        'providerPaymentAbsent', true,
        'idempotentReplay', false
    );
end;
$$;