

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
            'financial_terms', (
                select jsonb_build_object(
                    'merchandise_subtotal_amount', terms.merchandise_subtotal_amount,
                    'shipping_amount', terms.shipping_amount,
                    'buyer_protection_fee_amount', terms.buyer_protection_fee_amount,
                    'buyer_total_amount', terms.buyer_total_amount,
                    'seller_proceeds_amount', terms.seller_proceeds_amount,
                    'seller_transfer_release_amount', terms.seller_transfer_release_amount,
                    'seller_reserve_liability_amount', terms.seller_reserve_liability_amount,
                    'seller_shipping_share_amount', terms.seller_shipping_share_amount,
                    'platform_retained_amount', terms.platform_retained_amount,
                    'buyer_protection_refund_policy', (
                        select component->>'refund_policy'
                        from jsonb_array_elements(
                            coalesce(terms.fee_policy_snapshot->'components', '[]'::jsonb)
                        ) component
                        where component->>'component_key' = 'buyer_protection'
                        limit 1
                    ),
                    'currency', terms.currency,
                    'financial_terms_hash', terms.financial_terms_hash,
                    'financial_revision', terms.financial_revision
                )
                from commerce.order_financial_terms terms
                where terms.order_id = claim.order_id
            ),
            'settlement', (
                select jsonb_build_object(
                    'status', settlement.status,
                    'authorized_seller_amount', settlement.authorized_seller_amount,
                    'total_transferred_amount', settlement.total_transferred_amount,
                    'total_reversed_amount', settlement.total_reversed_amount,
                    'total_refunded_amount', settlement.total_refunded_amount,
                    'seller_reserve_liability_remaining_amount',
                        settlement.seller_reserve_liability_remaining_amount,
                    'platform_gross_remainder_amount', settlement.platform_gross_remainder_amount,
                    'manual_review_reason', settlement.manual_review_reason,
                    'version', settlement.version,
                    'updated_at', settlement.updated_at
                )
                from commerce.order_settlements settlement
                where settlement.order_id = claim.order_id
            ),
            'resolution_limits', (
                select jsonb_build_object(
                    'remaining_buyer_refund_amount',
                        greatest(0, terms.buyer_total_amount - totals.requested_amount),
                    'remaining_merchandise_refund_amount',
                        greatest(0, terms.merchandise_subtotal_amount
                            - totals.merchandise_refund_amount),
                    'remaining_shipping_refund_amount',
                        greatest(0, terms.shipping_amount - totals.shipping_refund_amount),
                    'remaining_protection_fee_refund_amount',
                        greatest(0, terms.buyer_protection_fee_amount
                            - totals.protection_fee_refund_amount),
                    'maximum_seller_transfer_amount', settlement.authorized_seller_amount,
                    'remaining_platform_contribution_amount',
                        greatest(
                            0,
                            terms.platform_retained_amount
                                - terms.buyer_protection_fee_amount
                                - totals.platform_contribution_amount
                        )
                )
                from commerce.order_financial_terms terms
                join commerce.order_settlements settlement
                    on settlement.order_id = terms.order_id
                cross join lateral (
                    select
                        coalesce(sum(request.requested_amount), 0) as requested_amount,
                        coalesce(sum(request.merchandise_refund_amount), 0)
                            as merchandise_refund_amount,
                        coalesce(sum(request.shipping_refund_amount), 0)
                            as shipping_refund_amount,
                        coalesce(sum(request.protection_fee_refund_amount), 0)
                            as protection_fee_refund_amount,
                        coalesce(sum(
                            request.requested_amount
                                - request.protection_fee_refund_amount
                                - request.seller_recovery_amount
                        ), 0) as platform_contribution_amount
                    from commerce.refund_requests request
                    where request.order_id = terms.order_id
                      and request.status not in ('rejected', 'cancelled', 'failed')
                ) totals
                where terms.order_id = claim.order_id
            ),
            'resolution_refund', (
                select jsonb_build_object(
                    'id', request.id,
                    'status', request.status,
                    'requested_amount', request.requested_amount,
                    'merchandise_refund_amount', request.merchandise_refund_amount,
                    'shipping_refund_amount', request.shipping_refund_amount,
                    'protection_fee_refund_amount', request.protection_fee_refund_amount,
                    'allocation_version', request.allocation_version,
                    'seller_recovery_amount', request.seller_recovery_amount,
                    'seller_reserve_offset_amount', request.seller_reserve_offset_amount,
                    'platform_contribution_amount',
                        request.requested_amount
                            - request.protection_fee_refund_amount
                            - request.seller_recovery_amount,
                    'requires_finance_approval', request.requires_finance_approval,
                    'dual_approval_required', request.dual_approval_required,
                    'first_approved_by', request.first_approved_by,
                    'first_approved_at', request.first_approved_at,
                    'second_approved_by', request.second_approved_by,
                    'second_approved_at', request.second_approved_at,
                    'decision_reason', request.decision_reason,
                    'version', request.version,
                    'created_at', request.created_at,
                    'updated_at', request.updated_at
                )
                from commerce.refund_requests request
                where request.claim_id = claim.id
                order by request.id desc
                limit 1
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
