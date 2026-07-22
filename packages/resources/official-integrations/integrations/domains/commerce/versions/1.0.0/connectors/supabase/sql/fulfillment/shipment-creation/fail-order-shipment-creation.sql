

create or replace function commerce.fail_order_shipment_creation(
    p_operation_id bigint,
    p_claim_token uuid,
    p_error text,
    p_unknown boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_operation commerce.shipment_creation_operations%rowtype;
begin
    select * into v_operation from commerce.shipment_creation_operations where id = p_operation_id for update;
    if not found then raise exception 'not_found: shipment creation operation'; end if;
    if v_operation.status = 'succeeded' then return to_jsonb(v_operation); end if;
    if v_operation.status <> 'processing' or v_operation.claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment creation lease mismatch';
    end if;
    update commerce.shipment_creation_operations set
        status = case when p_unknown then 'unknown' when attempts >= 12 then 'manual_review' else 'failed' end,
        available_at = now() + interval '5 minutes', last_error = left(coalesce(nullif(btrim(p_error), ''), 'shipment creation failed'), 2000),
        claim_token = null, claimed_at = null, claimed_by = null, updated_at = now()
    where id = v_operation.id returning * into v_operation;
    if v_operation.status in ('unknown', 'manual_review') then
        update commerce.order_fulfillments set status = 'manual_review',
            blocking_reason = 'shipment_creation_' || v_operation.status,
            version = version + 1, updated_at = now()
        where order_id = v_operation.order_id;
        update commerce.order_settlements set status = 'manual_review',
            manual_review_reason = 'shipment_creation_' || v_operation.status,
            version = version + 1, updated_at = now()
        where order_id = v_operation.order_id and status not in ('refunded', 'reversed');
    end if;
    return to_jsonb(v_operation);
end;
$$;