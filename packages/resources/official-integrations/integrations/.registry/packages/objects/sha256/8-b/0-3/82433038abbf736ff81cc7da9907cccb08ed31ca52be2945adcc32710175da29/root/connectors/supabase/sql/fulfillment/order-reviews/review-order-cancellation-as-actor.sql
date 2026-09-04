

create or replace function commerce.review_order_cancellation_as(
    p_request_id bigint,
    p_decision text,
    p_actor_kind text,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_request commerce.order_cancellation_requests%rowtype;
    v_order commerce.orders%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_refund jsonb;
    v_payment_cancellation jsonb;
begin
    if p_decision not in ('approved', 'rejected') then raise exception 'validation: unsupported cancellation decision'; end if;
    if p_actor_kind is null or p_actor_kind not in ('admin', 'system')
        or p_actor_id is null or length(btrim(p_actor_id)) = 0 then
        raise exception 'forbidden: cancellation review actor is not allowed';
    end if;
    select * into v_request from commerce.order_cancellation_requests where id = p_request_id for update;
    if not found then raise exception 'not_found: cancellation request'; end if;
    if v_request.status <> 'requested' then raise exception 'conflict: cancellation request is no longer reviewable'; end if;
    if p_decision = 'rejected' then
        update commerce.order_cancellation_requests set status = 'rejected', decision_reason = p_reason, decided_by = p_actor_id
        where id = v_request.id returning * into v_request;
        update commerce.orders set status = 'active' where id = v_request.order_id and status = 'cancellation_pending';
        perform commerce.append_financial_event(
            v_request.order_id, 'cancellation', v_request.id::text, 'cancellation_rejected',
            p_actor_kind, p_actor_id, p_reason, '{}'::jsonb,
            'commerce.order.cancellation_reviewed', 'cancellation:' || v_request.id || ':rejected'
        );
        return to_jsonb(v_request);
    end if;
    select * into v_order from commerce.orders where id = v_request.order_id for update;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id order by created_at desc limit 1;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id for update;
    if v_fulfillment.status in ('shipment_creating', 'label_created') then
        update commerce.order_cancellation_requests set
            status = 'provider_cancellation_pending', decision_reason = p_reason, decided_by = p_actor_id
        where id = v_request.id returning * into v_request;
        insert into commerce.shipment_cancellation_operations (
            order_id, order_cancellation_request_id, business_key, tracking_until
        ) values (
            v_order.id, v_request.id, 'shipment-cancellation:' || v_request.id,
            greatest(v_fulfillment.scan_grace_deadline, now() + interval '24 hours')
        ) on conflict (order_cancellation_request_id) do nothing;
        update commerce.orders set status = 'cancellation_pending' where id = v_order.id;
    elsif v_payment.status = 'succeeded' then
        v_refund := commerce.create_cancellation_refund_request(
            v_order.id, 'cancellation:' || v_request.id,
            'order_cancellation', p_actor_kind, p_actor_id
        );
        update commerce.order_cancellation_requests set
            status = 'refund_pending', decision_reason = p_reason, decided_by = p_actor_id
        where id = v_request.id returning * into v_request;
        update commerce.orders set status = 'cancellation_pending' where id = v_order.id;
    else
        update commerce.order_cancellation_requests set
            status = 'approved', decision_reason = p_reason, decided_by = p_actor_id
        where id = v_request.id returning * into v_request;
        v_payment_cancellation := commerce.ensure_payment_cancellation_request(
            v_order.id, 'cancelled', p_reason,
            'cancellation-review:' || v_request.id, v_request.id
        );
        select * into v_request from commerce.order_cancellation_requests where id = v_request.id;
    end if;
    perform commerce.append_financial_event(
        v_request.order_id, 'cancellation', v_request.id::text,
        'cancellation_' || v_request.status, p_actor_kind, p_actor_id, p_reason,
        jsonb_build_object('refundRequest', v_refund),
        'commerce.order.cancellation_reviewed', 'cancellation:' || v_request.id || ':' || v_request.status
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