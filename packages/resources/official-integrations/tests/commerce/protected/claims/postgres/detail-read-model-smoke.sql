\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../order/read-model/postgres/baseline.fixture.sql
\ir detail.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_result jsonb := commerce.get_marketplace_claim_read_model(9700000000007);
begin
    if v_result->>'state' <> 'ok'
        or pg_temp.jsonb_keys(v_result) <> array[
            'claim', 'events', 'evidence', 'return_events', 'state'
        ] then
        raise exception 'claim detail RPC: envelope changed: %', v_result;
    end if;

    if pg_temp.jsonb_keys(v_result->'claim') <> array[
        'buyer_cms_user_id', 'buyer_requested_amount', 'created_at', 'decision_reason',
        'description', 'id', 'order_id', 'public_id', 'reason',
        'resolution_buyer_refund_amount', 'resolution_outcome',
        'resolution_protection_fee_refund_amount', 'resolution_seller_transfer_amount',
        'resolved_at', 'resolved_by', 'return_carrier_accepted_at',
        'return_delivery_status', 'return_provider_reference',
        'return_recipient_handoff_at', 'return_ship_by_at', 'seller_id',
        'seller_response_by_at', 'status', 'updated_at', 'version'
    ] or (v_result->'claim'->>'id')::bigint <> 9700000000007
        or v_result->'claim'->'resolution_buyer_refund_amount' <> 'null'::jsonb
        or v_result->'claim'->'return_recipient_handoff_at' <> 'null'::jsonb then
        raise exception 'claim detail RPC: claim projection changed: %', v_result->'claim';
    end if;

    if pg_temp.jsonb_keys(v_result->'events'->0) <> array[
        'actor_id', 'actor_kind', 'claim_id', 'created_at',
        'data', 'event_type', 'id', 'message'
    ] or (select array_agg((item->>'id')::bigint)
            from jsonb_array_elements(v_result->'events') item)
            <> array[9700000000071, 9700000000072]::bigint[]
        or v_result->'events'->0->'data'->>'internal_key' <> 'kept_opaque' then
        raise exception 'claim detail RPC: event projection/order changed';
    end if;

    if pg_temp.jsonb_keys(v_result->'evidence'->0) <> array[
        'claim_id', 'created_at', 'description', 'file_size', 'id', 'metadata',
        'mime_type', 'original_filename', 'sha256', 'submitted_by_kind'
    ] or (select array_agg((item->>'id')::bigint)
            from jsonb_array_elements(v_result->'evidence') item)
            <> array[9700000000081, 9700000000082]::bigint[]
        or v_result->'evidence'->0->'description' <> 'null'::jsonb
        or v_result->'evidence'->0 ?| array['submitted_by', 'storage_bucket', 'storage_path']
        or v_result->'evidence'->1 ?| array['submitted_by', 'storage_bucket', 'storage_path'] then
        raise exception 'claim detail RPC: evidence projection/order/privacy changed';
    end if;

    if pg_temp.jsonb_keys(v_result->'return_events'->0) <> array[
        'created_at', 'id', 'normalized_status', 'occurred_at',
        'provider_event_id', 'provider_reference'
    ] or (select array_agg((item->>'id')::bigint)
            from jsonb_array_elements(v_result->'return_events') item)
            <> array[9700000000091, 9700000000092]::bigint[]
        or v_result->'return_events'->0 ? 'provider_evidence'
        or v_result->'return_events'->1 ? 'provider_evidence' then
        raise exception 'claim detail RPC: return projection/order/privacy changed';
    end if;
end;
$$;

rollback;
