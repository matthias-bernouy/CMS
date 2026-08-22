

create or replace function commerce.get_order_fulfillment_authorization(p_order_public_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_seller commerce.sellers%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_allowed boolean;
    v_reason text;
begin
    select * into v_order from commerce.orders where public_id = p_order_public_id;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id;
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id order by created_at desc limit 1;
    v_allowed := coalesce(v_terms.order_id is not null
        and v_order.status = 'active'
        and v_payment.status = 'succeeded'
        -- `shipment_creating` is retryable here. The durable reservation below
        -- remains the atomic authority: it serializes the seller/worker retry,
        -- rejects ambiguous/manual-review operations and preserves the exact
        -- immutable delivery quote.
        and v_fulfillment.status in ('awaiting_shipment', 'shipment_creating', 'label_created')
        and v_fulfillment.blocking_reason is null
        and not exists (
            select 1 from commerce.refund_requests
            where order_id = v_order.id and status not in ('rejected', 'cancelled', 'failed')
        )
        and not exists (
            select 1 from commerce.stripe_dispute_projections
            where order_id = v_order.id and status not in ('won', 'prevented', 'warning_closed')
        ), false);
    v_reason := case
        when v_terms.order_id is null then 'financial_terms_missing'
        when v_payment.status is distinct from 'succeeded' then 'payment_not_confirmed'
        when v_order.status <> 'active' then 'order_not_active'
        when v_fulfillment.status not in ('awaiting_shipment', 'shipment_creating', 'label_created') then 'fulfillment_not_eligible'
        when v_fulfillment.blocking_reason is not null then 'fulfillment_blocked'
        when exists (select 1 from commerce.refund_requests where order_id = v_order.id and status not in ('rejected', 'cancelled', 'failed')) then 'refund_open'
        when exists (select 1 from commerce.stripe_dispute_projections where order_id = v_order.id and status not in ('won', 'prevented', 'warning_closed')) then 'stripe_dispute_open'
        else null end;
    return jsonb_build_object(
        'allowed', v_allowed,
        'reason', v_reason,
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'sellerId', v_seller.cms_user_id,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'currency', upper(coalesce(v_terms.currency, '')),
        'deliveryQuoteId', coalesce(v_terms.delivery_quote_id, ''),
        'merchandiseSubtotalMinorAmount', coalesce(v_terms.merchandise_subtotal_amount, 0),
        'shippingAmount', coalesce(v_terms.shipping_amount, 0),
        'buyerTotalAmount', coalesce(v_terms.buyer_total_amount, 0),
        'financialTermsHash', v_terms.financial_terms_hash,
        'paymentStatus', coalesce(v_payment.status, 'created'),
        'fulfillmentStatus', coalesce(v_fulfillment.status, 'uninitialized')
    );
end;
$$;
