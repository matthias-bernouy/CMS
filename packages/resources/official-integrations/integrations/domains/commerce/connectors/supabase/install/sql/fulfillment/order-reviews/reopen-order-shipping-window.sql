create or replace function commerce.reopen_order_shipping_window(
    p_order_public_id uuid,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_creation commerce.shipment_creation_operations%rowtype;
    v_handoff_window interval;
    v_scan_grace_window interval;
    v_reopened_at timestamptz := clock_timestamp();
begin
    if p_actor_id is null or length(btrim(p_actor_id)) = 0
       or p_reason is null or length(btrim(p_reason)) < 8 then
        raise exception 'validation: audited reopening reason is required';
    end if;

    select * into v_order
    from commerce.orders
    where public_id = p_order_public_id
    for update;
    if not found then
        raise exception 'not_found: order';
    end if;

    select * into v_fulfillment
    from commerce.order_fulfillments
    where order_id = v_order.id
    for update;
    if not found then
        raise exception 'not_found: order fulfillment';
    end if;
    select * into v_settlement
    from commerce.order_settlements
    where order_id = v_order.id
    for update;
    if not found then
        raise exception 'not_found: order settlement';
    end if;
    select * into v_creation
    from commerce.shipment_creation_operations
    where order_id = v_order.id
    for update;
    if not found then
        raise exception 'not_found: shipment creation operation';
    end if;

    if v_order.status <> 'active'
       or v_fulfillment.status <> 'manual_review'
       or v_fulfillment.blocking_reason
            <> 'scan_grace_elapsed_without_carrier_acceptance'
       or v_fulfillment.payment_confirmed_at is null
       or v_fulfillment.seller_handoff_declared_at is not null
       or v_fulfillment.carrier_accepted_at is not null
       or v_settlement.status <> 'manual_review'
       or v_settlement.manual_review_reason
            <> 'fulfillment_reconciliation_required'
       or v_creation.status <> 'succeeded'
       or v_creation.provider_reference is null
       or exists (
            select 1 from commerce.order_cancellation_requests request
            where request.order_id = v_order.id
              and request.status not in ('rejected', 'completed')
       )
       or exists (
            select 1 from commerce.refund_requests request
            where request.order_id = v_order.id
              and request.status not in ('rejected', 'cancelled', 'failed')
       )
       or exists (
            select 1 from commerce.stripe_dispute_projections dispute
            where dispute.order_id = v_order.id
              and dispute.status not in ('won', 'prevented', 'warning_closed')
       ) then
        raise exception 'conflict: shipping window cannot be reopened';
    end if;

    v_handoff_window := greatest(
        v_fulfillment.seller_handoff_deadline
            - v_fulfillment.payment_confirmed_at,
        interval '1 hour'
    );
    v_scan_grace_window := greatest(
        v_fulfillment.scan_grace_deadline
            - v_fulfillment.seller_handoff_deadline,
        interval '1 hour'
    );

    update commerce.order_fulfillments set
        status = 'label_created',
        seller_handoff_deadline = v_reopened_at + v_handoff_window,
        scan_grace_deadline = v_reopened_at + v_handoff_window
            + v_scan_grace_window,
        blocking_reason = null,
        version = version + 1,
        updated_at = v_reopened_at
    where order_id = v_order.id
    returning * into v_fulfillment;

    update commerce.order_settlements set
        status = 'held',
        manual_review_reason = null,
        version = version + 1,
        updated_at = v_reopened_at
    where order_id = v_order.id
    returning * into v_settlement;

    update commerce.financial_exceptions set
        status = 'resolved',
        resolved_at = v_reopened_at,
        resolved_by = btrim(p_actor_id)
    where deduplication_key = 'deadline:fulfillment:' || v_order.id
      and status <> 'resolved';

    perform commerce.append_financial_event(
        v_order.id,
        'fulfillment',
        v_order.id::text,
        'shipping_window_reopened',
        'admin',
        btrim(p_actor_id),
        btrim(p_reason),
        jsonb_build_object(
            'sellerHandoffDeadline', v_fulfillment.seller_handoff_deadline,
            'scanGraceDeadline', v_fulfillment.scan_grace_deadline,
            'providerReference', v_creation.provider_reference
        ),
        'commerce.order.shipping_window_reopened',
        'shipping-window:' || v_order.id || ':reopened:' || v_fulfillment.version
    );

    return jsonb_build_object(
        'orderPublicId', v_order.public_id,
        'fulfillmentStatus', v_fulfillment.status,
        'settlementStatus', v_settlement.status,
        'sellerHandoffDeadline', v_fulfillment.seller_handoff_deadline,
        'scanGraceDeadline', v_fulfillment.scan_grace_deadline
    );
end;
$$;

revoke execute on function commerce.reopen_order_shipping_window(
    uuid, text, text
) from public, anon, authenticated;
grant execute on function commerce.reopen_order_shipping_window(
    uuid, text, text
) to service_role;
