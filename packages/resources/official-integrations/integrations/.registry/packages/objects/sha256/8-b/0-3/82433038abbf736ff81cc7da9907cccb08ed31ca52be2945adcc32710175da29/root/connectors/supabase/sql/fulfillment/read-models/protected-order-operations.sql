

create or replace view commerce.protected_order_operations
with (security_invoker = true)
as
select
    order_row.id as order_id,
    order_row.public_id as order_public_id,
    order_row.order_number,
    order_row.buyer_cms_user_id,
    order_row.seller_id,
    order_row.currency,
    terms.buyer_total_amount,
    terms.seller_proceeds_amount,
    terms.platform_retained_amount,
    terms.financial_terms_hash,
    coalesce(payment.status, 'created') as payment_status,
    fulfillment.status as fulfillment_status,
    settlement.status as settlement_status,
    claim.status as claim_status,
    coalesce(refunds.total_requested, 0) as total_refund_requested_amount,
    fulfillment.release_eligible_at,
    fulfillment.recipient_handoff_at,
    fulfillment.recipient_handoff_first_observed_at,
    fulfillment.claim_window_started_at,
    fulfillment.claim_by_at,
    greatest(order_row.updated_at, fulfillment.updated_at, settlement.updated_at) as updated_at
from commerce.orders order_row
join commerce.order_financial_terms terms on terms.order_id = order_row.id
join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
join commerce.order_settlements settlement on settlement.order_id = order_row.id
left join lateral (
    select attempt.status from commerce.order_payment_attempts attempt
    where attempt.order_id = order_row.id order by attempt.created_at desc limit 1
) payment on true
left join lateral (
    select marketplace_claim.status from commerce.marketplace_claims marketplace_claim
    where marketplace_claim.order_id = order_row.id order by marketplace_claim.created_at desc limit 1
) claim on true
left join lateral (
    select sum(requested_amount) total_requested from commerce.refund_requests request
    where request.order_id = order_row.id and request.status not in ('rejected', 'cancelled', 'failed')
) refunds on true;