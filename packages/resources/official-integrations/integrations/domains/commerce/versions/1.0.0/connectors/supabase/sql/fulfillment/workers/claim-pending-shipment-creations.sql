

create or replace function commerce.claim_pending_shipment_creations(
    p_worker_id text,
    p_limit integer default 5
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: worker id is required';
    end if;
    return query
    with candidates as (
        select operation.id
        from commerce.shipment_creation_operations operation
        join commerce.orders order_row on order_row.id = operation.order_id
        join commerce.order_fulfillments fulfillment on fulfillment.order_id = operation.order_id
        where operation.status in ('requested', 'failed', 'processing')
          and operation.available_at <= now()
          and operation.attempts < 12
          and order_row.status in ('active', 'cancellation_pending')
          and fulfillment.status in ('shipment_creating', 'awaiting_shipment')
          and (operation.status <> 'processing' or operation.claimed_at < now() - interval '5 minutes')
        order by operation.available_at, operation.created_at, operation.id
        for update of operation skip locked
        limit least(greatest(coalesce(p_limit, 5), 1), 12)
    ), claimed as (
        update commerce.shipment_creation_operations operation set
            status = 'processing', claim_token = gen_random_uuid(), claimed_at = now(),
            claimed_by = p_worker_id, attempts = operation.attempts + 1,
            last_error = null, updated_at = now()
        from candidates where operation.id = candidates.id returning operation.*
    )
    select jsonb_build_object(
        'operationId', operation.id, 'claimToken', operation.claim_token,
        'businessKey', operation.business_key, 'status', operation.status,
        'orderId', order_row.id, 'orderPublicId', order_row.public_id,
        'sellerId', seller.cms_user_id, 'buyerCmsUserId', order_row.buyer_cms_user_id,
        'deliveryQuoteId', terms.delivery_quote_id,
        'merchandiseSubtotalMinorAmount', terms.merchandise_subtotal_amount,
        'currency', upper(terms.currency), 'financialTermsHash', terms.financial_terms_hash,
        'fulfillmentStatus', fulfillment.status
    )
    from claimed operation
    join commerce.orders order_row on order_row.id = operation.order_id
    join commerce.sellers seller on seller.id = order_row.seller_id
    join commerce.order_financial_terms terms on terms.order_id = operation.order_id
    join commerce.order_fulfillments fulfillment on fulfillment.order_id = operation.order_id;
end;
$$;