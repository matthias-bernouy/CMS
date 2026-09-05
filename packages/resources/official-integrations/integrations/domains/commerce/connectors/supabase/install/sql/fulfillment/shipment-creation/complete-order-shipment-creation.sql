

create or replace function commerce.complete_order_shipment_creation(
    p_operation_id bigint,
    p_claim_token uuid,
    p_provider_reference text,
    p_provider_shipment_id text,
    p_provider_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_operation commerce.shipment_creation_operations%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
begin
    select * into v_operation from commerce.shipment_creation_operations
    where id = p_operation_id for update;
    if not found then raise exception 'not_found: shipment creation operation'; end if;
    if v_operation.status = 'succeeded' then return to_jsonb(v_operation) || jsonb_build_object('idempotentReplay', true); end if;
    if v_operation.status <> 'processing' or v_operation.claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment creation lease mismatch';
    end if;
    if p_provider_reference is null or length(btrim(p_provider_reference)) = 0 then
        raise exception 'validation: provider reference is required';
    end if;
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_operation.order_id for update;
    if v_fulfillment.status not in ('shipment_creating', 'label_created') then
        raise exception 'conflict: fulfillment no longer accepts shipment creation completion';
    end if;
    update commerce.shipment_creation_operations set
        status = 'succeeded', provider_reference = p_provider_reference,
        provider_shipment_id = nullif(btrim(p_provider_shipment_id), ''),
        provider_snapshot = coalesce(p_provider_snapshot, '{}'::jsonb),
        claim_token = null, claimed_at = null, claimed_by = null, last_error = null,
        updated_at = now()
    where id = v_operation.id returning * into v_operation;
    update commerce.order_fulfillments set
        status = 'label_created', provider_reference = p_provider_reference,
        version = version + 1, updated_at = now()
    where order_id = v_operation.order_id and status = 'shipment_creating'
    returning * into v_fulfillment;
    perform commerce.append_financial_event(
        v_operation.order_id, 'fulfillment', v_operation.order_id::text,
        'shipment_creation_succeeded', 'provider', 'mondial-relay', null,
        jsonb_build_object('operationId', v_operation.id, 'providerReference', p_provider_reference),
        'commerce.order.shipment_creation', v_operation.business_key || ':succeeded'
    );
    return to_jsonb(v_operation) || jsonb_build_object('fulfillment', to_jsonb(v_fulfillment), 'idempotentReplay', false);
end;
$$;