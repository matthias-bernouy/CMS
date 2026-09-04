

create or replace function commerce.refund_authorization_payload(p_refund_request_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'status', request.status,
    'orderId', order_row.id,
    'orderPublicId', order_row.public_id,
    'providerPaymentId', payment.provider_payment_id,
    'refundRequestId', request.business_key,
    'commerceRefundRequestId', request.id,
    'businessKey', request.business_key,
    'amount', request.requested_amount,
    'merchandiseRefundAmount', request.merchandise_refund_amount,
    'shippingRefundAmount', request.shipping_refund_amount,
    'allocationVersion', request.allocation_version,
    'authorizedSellerAmount', greatest(
        0, settlement.authorized_seller_amount - request.seller_recovery_amount
    ),
    'sellerEntitlementReductionAmount', request.seller_recovery_amount,
    'sellerRecoveryAmount', least(
        request.seller_recovery_amount - request.seller_reserve_offset_amount,
        greatest(0, settlement.total_transferred_amount - settlement.total_reversed_amount)
    ),
    'sellerReserveOffsetAmount', request.seller_reserve_offset_amount,
    'protectionFeeRefundAmount', request.protection_fee_refund_amount,
    'currency', upper(terms.currency),
    'financialTermsHash', terms.financial_terms_hash,
    'requiresFinanceApproval', request.requires_finance_approval,
    'requiresDualApproval', request.dual_approval_required
)
from commerce.refund_requests request
join commerce.orders order_row on order_row.id = request.order_id
join commerce.order_financial_terms terms on terms.order_id = order_row.id
join commerce.order_settlements settlement on settlement.order_id = order_row.id
left join lateral (
    select attempt.provider_payment_id
    from commerce.order_payment_attempts attempt
    where attempt.order_id = order_row.id and attempt.status = 'succeeded'
    order by attempt.created_at desc limit 1
) payment on true
where request.id = p_refund_request_id;
$$;
