

create or replace function commerce.complete_order_shipment_cancellation(
    p_operation_id bigint,
    p_claim_token uuid,
    p_provider_status text,
    p_provider_reference text,
    p_provider_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_operation commerce.shipment_cancellation_operations%rowtype;
    v_order commerce.orders%rowtype;
    v_request commerce.order_cancellation_requests%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_refund jsonb;
    v_payment_cancellation jsonb;
begin
    select * into v_operation from commerce.shipment_cancellation_operations
    where id = p_operation_id for update;
    if not found then raise exception 'not_found: shipment cancellation operation'; end if;
    if v_operation.status = 'completed' then return to_jsonb(v_operation) || jsonb_build_object('idempotentReplay', true); end if;
    if v_operation.status <> 'processing' or v_operation.claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment cancellation lease mismatch';
    end if;
    select * into v_order from commerce.orders where id = v_operation.order_id for update;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id for update;
    select * into v_request from commerce.order_cancellation_requests
    where id = v_operation.order_cancellation_request_id for update;
    if p_provider_status = 'cancelled_unscanned'
        and v_fulfillment.status not in (
            'seller_handoff_declared', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup',
            'collected_by_recipient', 'incident', 'lost', 'pickup_expired',
            'returning_to_sender', 'returned_to_sender', 'manual_review'
        ) then
        update commerce.shipment_cancellation_operations set
            status = 'requested', attempts = 0,
            available_at = now() + interval '5 minutes',
            provider_reference = nullif(btrim(p_provider_reference), ''),
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
            claim_token = null, claimed_at = null, claimed_by = null,
            last_error = 'awaiting terminal Delivery cancellation confirmation',
            updated_at = now()
        where id = v_operation.id returning * into v_operation;
        return to_jsonb(v_operation) || jsonb_build_object(
            'cancellationRequest', to_jsonb(v_request),
            'providerPending', true, 'idempotentReplay', false
        );
    end if;
    if p_provider_status is distinct from 'cancelled'
        or v_fulfillment.status in (
            'seller_handoff_declared', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup',
            'collected_by_recipient', 'incident', 'lost', 'pickup_expired',
            'returning_to_sender', 'returned_to_sender', 'manual_review'
        ) then
        update commerce.shipment_cancellation_operations set
            status = 'manual_review',
            provider_reference = nullif(btrim(p_provider_reference), ''),
            provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
            claim_token = null, claimed_at = null, claimed_by = null,
            last_error = left('ambiguous Delivery cancellation status: '
                || coalesce(nullif(btrim(p_provider_status), ''), 'missing'), 2000),
            updated_at = now()
        where id = v_operation.id returning * into v_operation;
        update commerce.order_cancellation_requests set status = 'manual_review'
        where id = v_request.id returning * into v_request;
        update commerce.order_fulfillments set
            status = 'manual_review',
            blocking_reason = 'shipment_cancellation_carrier_ambiguity',
            version = version + 1, updated_at = now()
        where order_id = v_order.id returning * into v_fulfillment;
        update commerce.order_settlements set
            status = 'manual_review',
            manual_review_reason = 'shipment_cancellation_carrier_ambiguity',
            version = version + 1, updated_at = now()
        where order_id = v_order.id and status not in ('refunded', 'reversed');
        insert into commerce.financial_exceptions (
            deduplication_key, order_id, kind, severity, reason, details
        ) values (
            'shipment-cancellation-ambiguity:' || v_operation.id,
            v_order.id, 'fulfillment_ambiguity', 'critical',
            'Delivery did not confirm a terminal unscanned cancellation',
            jsonb_build_object(
                'operationId', v_operation.id,
                'providerStatus', p_provider_status,
                'providerReference', p_provider_reference,
                'fulfillmentStatus', v_fulfillment.status
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update set
            status = 'open', details = excluded.details;
        return to_jsonb(v_operation) || jsonb_build_object(
            'cancellationRequest', to_jsonb(v_request),
            'providerPending', false, 'manualReview', true,
            'idempotentReplay', false
        );
    end if;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id order by created_at desc limit 1;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    update commerce.shipment_cancellation_operations set
        status = 'completed', provider_reference = nullif(btrim(p_provider_reference), ''),
        provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
        claim_token = null, claimed_at = null, claimed_by = null, last_error = null,
        updated_at = now()
    where id = v_operation.id returning * into v_operation;
    update commerce.order_fulfillments set status = 'cancelled',
        blocking_reason = 'shipment_cancelled_after_tracking_grace', version = version + 1,
        updated_at = now()
    where order_id = v_order.id;
    if v_payment.status = 'succeeded' then
        v_refund := commerce.create_cancellation_refund_request(
            v_order.id, 'cancellation:' || v_request.id,
            'order_cancellation', v_request.requested_by_kind, v_request.requested_by
        );
        update commerce.order_cancellation_requests set status = 'refund_pending'
        where id = v_request.id returning * into v_request;
    else
        v_payment_cancellation := commerce.ensure_payment_cancellation_request(
            v_order.id, 'cancelled', v_request.reason,
            'shipment-cancellation:' || v_request.id, v_request.id
        );
        select * into v_request from commerce.order_cancellation_requests where id = v_request.id;
    end if;
    perform commerce.append_financial_event(
        v_order.id, 'cancellation', v_request.id::text, 'shipment_cancellation_confirmed',
        'provider', 'mondial-relay', v_request.reason,
        jsonb_build_object('operationId', v_operation.id, 'providerStatus', p_provider_status),
        'commerce.order.shipment_cancellation', v_operation.business_key || ':completed'
    );
    return to_jsonb(v_operation) || jsonb_build_object(
        'cancellationRequest', to_jsonb(v_request), 'refundRequest', v_refund,
        'refundAuthorization', case when v_refund is null then null
            else commerce.refund_authorization_payload((v_refund->>'id')::bigint) end,
        'paymentCancellationAuthorization', v_payment_cancellation,
        'idempotentReplay', false
    );
end;
$$;