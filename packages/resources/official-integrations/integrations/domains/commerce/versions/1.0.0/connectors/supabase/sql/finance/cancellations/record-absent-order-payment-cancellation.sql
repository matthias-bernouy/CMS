

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
    v_idempotent_replay boolean;
    v_row_count integer;
    v_platform_liability_changed boolean := false;
    v_seller_risk_changed boolean := false;
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
    v_idempotent_replay := v_event_id is null;
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
    -- Re-apply terminal invariants even when an older deployment already marked
    -- the cancellation completed before releasing its financial state.
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
    where order_id = v_order.id
      and (
          status is distinct from 'cancelled'
          or blocking_reason is distinct from case
              when v_cancellation.target_order_status = 'expired' then 'payment_window_expired'
              else 'order_cancelled_before_payment' end
      );
    update commerce.order_settlements
    set status = 'released',
        authorized_seller_amount = 0,
        seller_reserve_liability_remaining_amount = 0,
        platform_gross_remainder_amount = 0,
        manual_review_reason = null,
        version = version + 1,
        updated_at = now()
    where order_id = v_order.id
      and (
          status,
          authorized_seller_amount,
          seller_reserve_liability_remaining_amount,
          platform_gross_remainder_amount,
          manual_review_reason
      ) is distinct from (
          'released',
          0::bigint,
          0::bigint,
          0::bigint,
          null::text
      );
    get diagnostics v_row_count = row_count;
    v_platform_liability_changed := v_row_count > 0;
    v_seller_risk_changed := v_row_count > 0;
    update commerce.seller_financial_exposures
    set recovered_amount = amount,
        status = 'recovered',
        reason = 'Seller reserve released because the provider payment is absent',
        updated_at = now()
    where order_id = v_order.id
      and exposure_key = 'reserve:' || v_order.id
      and exposure_type = 'reserve'
      and (
          recovered_amount,
          status,
          reason
      ) is distinct from (
          amount,
          'recovered',
          'Seller reserve released because the provider payment is absent'
      );
    get diagnostics v_row_count = row_count;
    v_seller_risk_changed := v_seller_risk_changed or v_row_count > 0;
    if v_seller_risk_changed then
        perform commerce.refresh_seller_risk_state(v_order.seller_id);
    end if;
    update commerce.order_cancellation_requests
    set status = 'completed'
    where id = v_cancellation.order_cancellation_request_id
      and status = 'provider_cancellation_pending';
    update commerce.financial_exceptions
    set status = 'resolved', resolved_at = now(), resolved_by = 'stripe-payment-absent'
    where deduplication_key = 'deadline:payment:' || v_order.id
      and status <> 'resolved';
    insert into commerce.platform_payout_order_liabilities as liability (
        order_id, lifecycle_status, risk_release_at
    ) values (
        v_order.id, 'released', null
    ) on conflict (order_id) do update set
        lifecycle_status = excluded.lifecycle_status,
        risk_release_at = excluded.risk_release_at,
        updated_at = now()
    where (liability.lifecycle_status, liability.risk_release_at)
        is distinct from (excluded.lifecycle_status, excluded.risk_release_at);
    get diagnostics v_row_count = row_count;
    v_platform_liability_changed := v_platform_liability_changed or v_row_count > 0;
    if v_platform_liability_changed then
        perform commerce.refresh_platform_payout_liability_delta(
            array[v_order.id],
            'Provider-absent payment cancellation released prospective liability', null
        );
    end if;
    return jsonb_build_object(
        'orderId', v_order.id,
        'status', v_cancellation.status,
        'providerPaymentAbsent', true,
        'idempotentReplay', v_idempotent_replay
    );
end;
$$;
