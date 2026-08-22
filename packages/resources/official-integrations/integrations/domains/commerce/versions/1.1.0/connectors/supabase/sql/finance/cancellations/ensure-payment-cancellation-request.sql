

create or replace function commerce.ensure_payment_cancellation_request(
    p_order_id bigint,
    p_target_order_status text,
    p_reason text,
    p_actor_id text,
    p_order_cancellation_request_id bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_attempt commerce.order_payment_attempts%rowtype;
    v_request commerce.payment_cancellation_requests%rowtype;
    v_business_key text;
begin
    if p_target_order_status not in ('cancelled', 'expired') then
        raise exception 'validation: unsupported payment cancellation target';
    end if;
    select * into v_order from commerce.orders where id = p_order_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_attempt from commerce.order_payment_attempts
    where order_id = v_order.id order by created_at desc limit 1;
    v_business_key := case when p_order_cancellation_request_id is not null
        then 'payment-cancellation:order-cancellation:' || p_order_cancellation_request_id
        else 'payment-cancellation:deadline:' || v_order.id end;
    insert into commerce.payment_cancellation_requests (
        order_id, order_cancellation_request_id, business_key, target_order_status,
        reason, provider_payment_id, provider_payment_intent_id
    ) values (
        v_order.id, p_order_cancellation_request_id, v_business_key, p_target_order_status,
        p_reason, v_attempt.provider_payment_id, v_attempt.provider_payment_intent_id
    ) on conflict (business_key) do update set
        provider_payment_id = coalesce(commerce.payment_cancellation_requests.provider_payment_id, excluded.provider_payment_id),
        provider_payment_intent_id = coalesce(commerce.payment_cancellation_requests.provider_payment_intent_id, excluded.provider_payment_intent_id)
    returning * into v_request;
    insert into commerce.financial_operation_dispatch_claims (
        operation_kind, operation_id, order_id
    ) values (
        'payment_cancellation', v_request.id::text, v_order.id
    ) on conflict (operation_kind, operation_id) do nothing;
    update commerce.orders set status = 'cancellation_pending', version = version + 1
    where id = v_order.id and status in ('awaiting_payment', 'active');
    if p_order_cancellation_request_id is not null then
        update commerce.order_cancellation_requests set status = 'provider_cancellation_pending'
        where id = p_order_cancellation_request_id
          and status in ('approved', 'provider_cancellation_pending');
    end if;
    if v_attempt.status = 'cancelled' then
        update commerce.payment_cancellation_requests set status = 'completed'
        where id = v_request.id returning * into v_request;
        perform commerce.restore_order_inventory(v_order.id);
        update commerce.orders set status = p_target_order_status, version = version + 1
        where id = v_order.id and status = 'cancellation_pending';
        update commerce.order_fulfillments set
            status = 'cancelled', blocking_reason = case
                when p_target_order_status = 'expired' then 'payment_window_expired'
                else 'order_cancelled_before_payment' end,
            version = version + 1
        where order_id = v_order.id;
        update commerce.order_settlements set
            status = 'blocked', manual_review_reason = case
                when p_target_order_status = 'expired' then 'order_expired_without_payment'
                else 'order_cancelled_without_payment' end,
            version = version + 1
        where order_id = v_order.id;
        update commerce.order_cancellation_requests set status = 'completed'
        where id = p_order_cancellation_request_id;
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'payment_cancellation', v_request.id::text, 'payment_cancellation_requested',
        'system', p_actor_id, p_reason,
        jsonb_build_object('targetOrderStatus', p_target_order_status,
            'providerPaymentId', v_attempt.provider_payment_id),
        'commerce.order.payment_cancellation_requested', v_business_key || ':requested'
    );
    return commerce.payment_cancellation_authorization_payload(v_request.id);
end;
$$;