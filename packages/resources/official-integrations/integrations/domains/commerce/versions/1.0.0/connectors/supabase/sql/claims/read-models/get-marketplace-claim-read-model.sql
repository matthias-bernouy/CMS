

create or replace function commerce.get_marketplace_claim_read_model(
    p_claim_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'claim', jsonb_build_object(
                'id', claim.id,
                'public_id', claim.public_id,
                'order_id', claim.order_id,
                'buyer_cms_user_id', claim.buyer_cms_user_id,
                'seller_id', claim.seller_id,
                'reason', claim.reason,
                'status', claim.status,
                'description', claim.description,
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
                'resolved_at', claim.resolved_at,
                'resolved_by', claim.resolved_by,
                'version', claim.version,
                'created_at', claim.created_at,
                'updated_at', claim.updated_at
            ),
            'events', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', event.id,
                    'claim_id', event.claim_id,
                    'event_type', event.event_type,
                    'actor_kind', event.actor_kind,
                    'actor_id', event.actor_id,
                    'message', event.message,
                    'data', event.data,
                    'created_at', event.created_at
                ) order by event.created_at, event.id)
                from commerce.marketplace_claim_events event
                where event.claim_id = claim.id
            ), '[]'::jsonb),
            'evidence', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', evidence.id,
                    'claim_id', evidence.claim_id,
                    'submitted_by_kind', evidence.submitted_by_kind,
                    'mime_type', evidence.mime_type,
                    'file_size', evidence.file_size,
                    'original_filename', evidence.original_filename,
                    'sha256', evidence.sha256,
                    'description', evidence.description,
                    'metadata', evidence.metadata,
                    'created_at', evidence.created_at
                ) order by evidence.created_at, evidence.id)
                from commerce.marketplace_claim_evidence evidence
                where evidence.claim_id = claim.id
            ), '[]'::jsonb),
            'return_events', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', event.id,
                    'provider_event_id', event.provider_event_id,
                    'provider_reference', event.provider_reference,
                    'normalized_status', event.normalized_status,
                    'occurred_at', event.occurred_at,
                    'created_at', event.created_at
                ) order by event.occurred_at, event.id)
                from commerce.marketplace_claim_return_events event
                where event.claim_id = claim.id
            ), '[]'::jsonb)
        )
        from commerce.marketplace_claims claim
        where claim.id = p_claim_id
    ), jsonb_build_object('state', 'not_found'));
$$;

revoke execute on function commerce.get_marketplace_claim_read_model(bigint)
from public, anon, authenticated;
grant execute on function commerce.get_marketplace_claim_read_model(bigint)
to service_role;