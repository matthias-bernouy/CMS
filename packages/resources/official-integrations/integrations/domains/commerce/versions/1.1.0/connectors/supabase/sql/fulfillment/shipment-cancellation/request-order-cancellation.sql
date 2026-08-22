

create or replace function commerce.request_order_cancellation(
    p_order_id bigint,
    p_actor_kind text,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_seller commerce.sellers%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_request commerce.order_cancellation_requests%rowtype;
    v_refund jsonb;
    v_payment_cancellation jsonb;
begin
    select * into v_order from commerce.orders where id = p_order_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    if p_actor_kind = 'buyer' and v_order.buyer_cms_user_id <> p_actor_id then
        raise exception 'not_found: order';
    elsif p_actor_kind = 'seller' and v_seller.cms_user_id <> p_actor_id then
        raise exception 'not_found: sale';
    elsif p_actor_kind is null or p_actor_kind not in ('buyer', 'seller', 'system') then
        raise exception 'forbidden: cancellation actor is not allowed';
    end if;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id for update;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id order by created_at desc limit 1;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_request
    from commerce.order_cancellation_requests
    where order_id = v_order.id
      and requested_by_kind = p_actor_kind
      and requested_by = p_actor_id
      and reason = p_reason
      and status <> 'rejected'
    order by id desc
    limit 1;
    if found then
        select to_jsonb(refund) into v_refund
        from commerce.refund_requests refund
        where refund.business_key = 'cancellation:' || v_request.id;
        select commerce.payment_cancellation_authorization_payload(cancellation.id)
        into v_payment_cancellation
        from commerce.payment_cancellation_requests cancellation
        where cancellation.order_cancellation_request_id = v_request.id
        order by cancellation.id desc
        limit 1;
        return to_jsonb(v_request) || jsonb_build_object(
            'refundRequest', v_refund,
            'paymentCancellationAuthorization', v_payment_cancellation,
            'refundAuthorization', case when v_refund is null then null
                else commerce.refund_authorization_payload((v_refund->>'id')::bigint) end,
            'orderPublicId', v_order.public_id
        );
    end if;
    if v_order.status in ('completed', 'cancelled', 'expired') then
        raise exception 'conflict: order cannot be cancelled';
    end if;
    if v_fulfillment.status in ('seller_handoff_declared', 'carrier_accepted', 'in_transit',
        'arrived_at_pickup_point', 'available_for_pickup', 'collected_by_recipient') then
        raise exception 'conflict: carrier reconciliation or claim resolution is required';
    end if;
    insert into commerce.order_cancellation_requests (
        order_id, status, requested_by_kind, requested_by, reason
    ) values (
        v_order.id,
        case
            when v_order.status in ('awaiting_quote', 'awaiting_payment') and v_payment.status is distinct from 'succeeded' then 'approved'
            when p_actor_kind = 'seller' and v_fulfillment.status in ('shipment_creating', 'label_created') then 'provider_cancellation_pending'
            when p_actor_kind = 'seller' and v_fulfillment.status = 'awaiting_shipment' then 'approved'
            when p_actor_kind = 'buyer' and v_fulfillment.status = 'awaiting_shipment' then 'approved'
            else 'requested' end,
        p_actor_kind, p_actor_id, p_reason
    ) returning * into v_request;
    if v_request.status = 'provider_cancellation_pending' then
        insert into commerce.shipment_cancellation_operations (
            order_id, order_cancellation_request_id, business_key, tracking_until
        ) values (
            v_order.id, v_request.id, 'shipment-cancellation:' || v_request.id,
            greatest(v_fulfillment.scan_grace_deadline, now() + interval '24 hours')
        ) on conflict (order_cancellation_request_id) do nothing;
        update commerce.orders set status = 'cancellation_pending' where id = v_order.id;
    elsif v_request.status = 'approved' and v_payment.status = 'succeeded' then
        v_refund := commerce.create_cancellation_refund_request(
            v_order.id, 'cancellation:' || v_request.id,
            'order_cancellation', p_actor_kind, p_actor_id
        );
        update commerce.order_cancellation_requests set status = 'refund_pending'
        where id = v_request.id returning * into v_request;
        update commerce.orders set status = 'cancellation_pending' where id = v_order.id;
    elsif v_request.status = 'approved' and v_order.status = 'awaiting_quote' then
        perform commerce.restore_order_inventory(v_order.id);
        update commerce.orders set status = 'cancelled' where id = v_order.id;
        update commerce.order_cancellation_requests set status = 'completed'
        where id = v_request.id returning * into v_request;
    elsif v_request.status = 'approved' then
        v_payment_cancellation := commerce.ensure_payment_cancellation_request(
            v_order.id, 'cancelled', p_reason,
            'order-cancellation:' || v_request.id, v_request.id
        );
        select * into v_request from commerce.order_cancellation_requests where id = v_request.id;
    else
        update commerce.orders set status = 'cancellation_pending' where id = v_order.id;
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'cancellation', v_request.id::text, 'cancellation_' || v_request.status,
        p_actor_kind, p_actor_id, p_reason,
        jsonb_build_object('refundRequest', v_refund),
        'commerce.order.cancellation', 'cancellation:' || v_request.id || ':' || v_request.status
    );
    return to_jsonb(v_request) || jsonb_build_object(
        'refundRequest', v_refund,
        'paymentCancellationAuthorization', v_payment_cancellation,
        'refundAuthorization', case when v_refund is null then null
            else commerce.refund_authorization_payload((v_refund->>'id')::bigint) end,
        'orderPublicId', v_order.public_id
    );
end;
$$;