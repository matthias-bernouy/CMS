\set ON_ERROR_STOP on

begin;
set local role service_role;
\ir ../../../../order/read-model/postgres/baseline.fixture.sql
\ir detail.fixture.sql

create function pg_temp.jsonb_keys(p_value jsonb)
returns text[] language sql immutable as $$
    select coalesce(array_agg(key order by key), array[]::text[])
    from jsonb_object_keys(p_value) key;
$$;

do $$
declare
    v_claim jsonb;
    v_events jsonb;
    v_evidence jsonb;
    v_return_events jsonb;
begin
    select jsonb_build_object(
        'id', claim.id, 'public_id', claim.public_id, 'order_id', claim.order_id,
        'buyer_cms_user_id', claim.buyer_cms_user_id, 'seller_id', claim.seller_id,
        'reason', claim.reason, 'status', claim.status, 'description', claim.description,
        'buyer_requested_amount', claim.buyer_requested_amount,
        'resolution_outcome', claim.resolution_outcome,
        'resolution_buyer_refund_amount', claim.resolution_buyer_refund_amount,
        'resolution_seller_transfer_amount', claim.resolution_seller_transfer_amount,
        'resolution_protection_fee_refund_amount', claim.resolution_protection_fee_refund_amount,
        'decision_reason', claim.decision_reason,
        'seller_response_by_at', claim.seller_response_by_at,
        'return_ship_by_at', claim.return_ship_by_at,
        'return_delivery_status', claim.return_delivery_status,
        'return_provider_reference', claim.return_provider_reference,
        'return_carrier_accepted_at', claim.return_carrier_accepted_at,
        'return_recipient_handoff_at', claim.return_recipient_handoff_at,
        'resolved_at', claim.resolved_at, 'resolved_by', claim.resolved_by,
        'version', claim.version, 'created_at', claim.created_at, 'updated_at', claim.updated_at
    ) into v_claim
    from commerce.marketplace_claims claim where claim.id = 9700000000007;

    select coalesce(jsonb_agg(to_jsonb(event) order by event.created_at, event.id), '[]')
    into v_events from commerce.marketplace_claim_events event
    where event.claim_id = 9700000000007;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', evidence.id, 'claim_id', evidence.claim_id,
        'submitted_by_kind', evidence.submitted_by_kind, 'mime_type', evidence.mime_type,
        'file_size', evidence.file_size, 'original_filename', evidence.original_filename,
        'sha256', evidence.sha256, 'description', evidence.description,
        'metadata', evidence.metadata, 'created_at', evidence.created_at
    ) order by evidence.created_at, evidence.id), '[]') into v_evidence
    from commerce.marketplace_claim_evidence evidence
    where evidence.claim_id = 9700000000007;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', event.id, 'provider_event_id', event.provider_event_id,
        'provider_reference', event.provider_reference,
        'normalized_status', event.normalized_status, 'occurred_at', event.occurred_at,
        'created_at', event.created_at
    ) order by event.occurred_at, event.id), '[]') into v_return_events
    from commerce.marketplace_claim_return_events event
    where event.claim_id = 9700000000007;

    if pg_temp.jsonb_keys(v_claim) <> array[
        'buyer_cms_user_id', 'buyer_requested_amount', 'created_at', 'decision_reason',
        'description', 'id', 'order_id', 'public_id', 'reason', 'resolution_buyer_refund_amount',
        'resolution_outcome', 'resolution_protection_fee_refund_amount',
        'resolution_seller_transfer_amount', 'resolved_at', 'resolved_by',
        'return_carrier_accepted_at', 'return_delivery_status', 'return_provider_reference',
        'return_recipient_handoff_at', 'return_ship_by_at', 'seller_id',
        'seller_response_by_at', 'status', 'updated_at', 'version'
    ] then raise exception 'claim detail baseline: claim projection changed'; end if;

    if (select array_agg((item->>'id')::bigint) from jsonb_array_elements(v_events) item)
            <> array[9700000000071, 9700000000072]::bigint[]
        or pg_temp.jsonb_keys(v_events->0) <> array[
            'actor_id', 'actor_kind', 'claim_id', 'created_at',
            'data', 'event_type', 'id', 'message'
        ]
        or v_events->0->'data'->>'internal_key' <> 'kept_opaque'
        or (select array_agg((item->>'id')::bigint) from jsonb_array_elements(v_evidence) item)
            <> array[9700000000081, 9700000000082]::bigint[]
        or pg_temp.jsonb_keys(v_evidence->0) <> array[
            'claim_id', 'created_at', 'description', 'file_size', 'id', 'metadata',
            'mime_type', 'original_filename', 'sha256', 'submitted_by_kind'
        ]
        or (select array_agg((item->>'id')::bigint) from jsonb_array_elements(v_return_events) item)
            <> array[9700000000091, 9700000000092]::bigint[]
        or pg_temp.jsonb_keys(v_return_events->0) <> array[
            'created_at', 'id', 'normalized_status', 'occurred_at',
            'provider_event_id', 'provider_reference'
        ] then
        raise exception 'claim detail baseline: relation order or privacy changed';
    end if;

    if v_claim->'resolution_buyer_refund_amount' <> 'null'::jsonb
        or v_claim->'return_recipient_handoff_at' <> 'null'::jsonb
        or v_evidence->0->'description' <> 'null'::jsonb then
        raise exception 'claim detail baseline: nullable fields changed';
    end if;
end;
$$;

rollback;
