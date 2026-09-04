

create or replace function commerce.payment_cancellation_authorization_payload(p_request_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'status', request.status,
    'paymentCancellationRequestId', request.id,
    'cancellationRequestId', request.business_key,
    'orderId', order_row.id,
    'orderPublicId', order_row.public_id,
    'clientReferenceId', order_row.public_id,
    'providerPaymentId', coalesce(request.provider_payment_id, payment.provider_payment_id),
    'providerPaymentIntentId', coalesce(request.provider_payment_intent_id, payment.provider_payment_intent_id),
    'targetOrderStatus', request.target_order_status,
    'reason', request.reason,
    'amount', terms.buyer_total_amount,
    'currency', upper(terms.currency),
    'financialTermsHash', terms.financial_terms_hash
)
from commerce.payment_cancellation_requests request
join commerce.orders order_row on order_row.id = request.order_id
join commerce.order_financial_terms terms on terms.order_id = order_row.id
left join lateral (
    select attempt.provider_payment_id, attempt.provider_payment_intent_id
    from commerce.order_payment_attempts attempt
    where attempt.order_id = order_row.id
    order by attempt.created_at desc limit 1
) payment on true
where request.id = p_request_id;
$$;