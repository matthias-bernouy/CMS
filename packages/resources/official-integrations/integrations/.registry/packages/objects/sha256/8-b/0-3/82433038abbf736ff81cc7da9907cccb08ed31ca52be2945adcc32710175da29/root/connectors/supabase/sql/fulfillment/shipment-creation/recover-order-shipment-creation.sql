

create or replace function commerce.recover_order_shipment_creation(
    p_order_public_id uuid,
    p_provider_reference text,
    p_provider_shipment_id text,
    p_provider_snapshot jsonb,
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
    v_operation commerce.shipment_creation_operations%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
begin
    if p_provider_reference is null or length(btrim(p_provider_reference)) = 0
        or p_provider_shipment_id is null or length(btrim(p_provider_shipment_id)) = 0
        or p_actor_kind is distinct from 'admin'
        or p_actor_id is null or length(btrim(p_actor_id)) = 0
        or p_reason is null or length(btrim(p_reason)) < 8 then
        raise exception 'validation: provider shipment and audited recovery reason are required';
    end if;
    select * into v_order from commerce.orders where public_id = p_order_public_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_operation from commerce.shipment_creation_operations
    where order_id = v_order.id for update;
    if not found then raise exception 'not_found: shipment creation operation'; end if;
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id for update;
    if v_operation.status = 'succeeded' then
        if v_operation.provider_reference = btrim(p_provider_reference)
            and (v_operation.provider_shipment_id is null
                or v_operation.provider_shipment_id = btrim(p_provider_shipment_id)) then
            return to_jsonb(v_operation) || jsonb_build_object(
                'fulfillment', to_jsonb(v_fulfillment), 'idempotentReplay', true
            );
        end if;
        raise exception 'conflict: recovered shipment differs from the completed operation';
    end if;
    if v_operation.status not in ('processing', 'failed', 'unknown', 'manual_review') then
        raise exception 'conflict: shipment creation operation cannot be recovered';
    end if;
    if v_fulfillment.status not in ('awaiting_shipment', 'shipment_creating', 'label_created', 'manual_review')
        or (v_fulfillment.status = 'manual_review'
            and v_fulfillment.blocking_reason not in (
                'shipment_creation_unknown', 'shipment_creation_manual_review'
            )) then
        raise exception 'conflict: fulfillment cannot accept shipment creation recovery';
    end if;
    update commerce.shipment_creation_operations set
        status = 'succeeded',
        provider_reference = btrim(p_provider_reference),
        provider_shipment_id = btrim(p_provider_shipment_id),
        provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
        claim_token = null, claimed_at = null, claimed_by = null,
        last_error = null, updated_at = now()
    where id = v_operation.id returning * into v_operation;
    update commerce.order_fulfillments set
        status = 'label_created', provider_reference = btrim(p_provider_reference),
        blocking_reason = null, version = version + 1, updated_at = now()
    where order_id = v_order.id returning * into v_fulfillment;
    update commerce.order_settlements set
        status = 'held', manual_review_reason = null,
        version = version + 1, updated_at = now()
    where order_id = v_order.id and status = 'manual_review'
      and manual_review_reason in ('shipment_creation_unknown', 'shipment_creation_manual_review');
    update commerce.financial_exceptions set
        status = 'resolved', resolved_at = now(), resolved_by = p_actor_id
    where order_id = v_order.id and status <> 'resolved'
      and kind = 'fulfillment_ambiguity'
      and reason like 'Shipment creation%';
    perform commerce.append_financial_event(
        v_order.id, 'fulfillment', v_order.id::text,
        'shipment_creation_recovered', p_actor_kind, p_actor_id, p_reason,
        jsonb_build_object(
            'operationId', v_operation.id,
            'providerReference', v_operation.provider_reference,
            'providerShipmentId', v_operation.provider_shipment_id
        ),
        'commerce.order.shipment_creation_recovered',
        v_operation.business_key || ':recovered'
    );
    return to_jsonb(v_operation) || jsonb_build_object(
        'fulfillment', to_jsonb(v_fulfillment), 'idempotentReplay', false
    );
end;
$$;