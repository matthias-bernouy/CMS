

create or replace function commerce.fail_order_shipment_cancellation(
    p_operation_id bigint,
    p_claim_token uuid,
    p_error text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_operation commerce.shipment_cancellation_operations%rowtype;
begin
    select * into v_operation from commerce.shipment_cancellation_operations where id = p_operation_id for update;
    if not found then raise exception 'not_found: shipment cancellation operation'; end if;
    if v_operation.status = 'completed' then return to_jsonb(v_operation); end if;
    if v_operation.status <> 'processing' or v_operation.claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment cancellation lease mismatch';
    end if;
    update commerce.shipment_cancellation_operations set
        status = case when attempts >= 12 then 'manual_review' else 'failed' end,
        available_at = now() + interval '5 minutes',
        last_error = left(coalesce(nullif(btrim(p_error), ''), 'shipment cancellation failed'), 2000),
        claim_token = null, claimed_at = null, claimed_by = null, updated_at = now()
    where id = v_operation.id returning * into v_operation;
    if v_operation.status = 'manual_review' then
        update commerce.order_cancellation_requests set status = 'manual_review'
        where id = v_operation.order_cancellation_request_id;
        update commerce.order_fulfillments set status = 'manual_review',
            blocking_reason = 'shipment_cancellation_manual_review', version = version + 1,
            updated_at = now() where order_id = v_operation.order_id;
        update commerce.order_settlements set status = 'manual_review',
            manual_review_reason = 'shipment_cancellation_manual_review',
            version = version + 1, updated_at = now()
        where order_id = v_operation.order_id and status not in ('refunded', 'reversed');
    end if;
    return to_jsonb(v_operation);
end;
$$;