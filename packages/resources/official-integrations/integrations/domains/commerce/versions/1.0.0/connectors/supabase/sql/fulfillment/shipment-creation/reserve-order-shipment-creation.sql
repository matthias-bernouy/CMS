

create or replace function commerce.reserve_order_shipment_creation(
    p_order_public_id uuid,
    p_seller_cms_user_id text,
    p_worker_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_seller commerce.sellers%rowtype;
    v_payment commerce.order_payment_attempts%rowtype;
    v_operation commerce.shipment_creation_operations%rowtype;
    v_business_key text;
    v_idempotent_replay boolean := false;
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: shipment creation worker id is required';
    end if;
    select * into v_order from commerce.orders where public_id = p_order_public_id for update;
    if not found then raise exception 'not_found: order'; end if;
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    if v_seller.cms_user_id is distinct from p_seller_cms_user_id then
        raise exception 'not_found: sale';
    end if;
    select * into v_fulfillment from commerce.order_fulfillments where order_id = v_order.id for update;
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_payment from commerce.order_payment_attempts
    where order_id = v_order.id and status = 'succeeded' order by created_at desc limit 1;
    if v_order.status <> 'active' or v_payment.id is null
        or v_fulfillment.status not in ('awaiting_shipment', 'shipment_creating', 'label_created')
        or v_fulfillment.blocking_reason is not null
        or exists (select 1 from commerce.refund_requests request
            where request.order_id = v_order.id and request.status not in ('rejected', 'cancelled', 'failed'))
        or exists (select 1 from commerce.order_cancellation_requests request
            where request.order_id = v_order.id and request.status not in ('rejected', 'completed'))
    then
        raise exception 'conflict: Commerce has not authorized shipment creation';
    end if;
    v_business_key := 'shipment-creation:' || v_order.id || ':' || v_terms.delivery_quote_id;
    insert into commerce.shipment_creation_operations (
        order_id, business_key, delivery_quote_id, financial_terms_hash, status,
        claim_token, claimed_at, claimed_by, attempts
    ) values (
        v_order.id, v_business_key, v_terms.delivery_quote_id, v_terms.financial_terms_hash,
        'processing', gen_random_uuid(), now(), p_worker_id, 1
    ) on conflict (order_id) do nothing;
    select * into v_operation from commerce.shipment_creation_operations
    where order_id = v_order.id for update;
    if v_operation.business_key <> v_business_key
        or v_operation.delivery_quote_id <> v_terms.delivery_quote_id
        or v_operation.financial_terms_hash <> v_terms.financial_terms_hash then
        raise exception 'conflict: shipment creation replay changed immutable terms';
    end if;
    if v_operation.status in ('failed', 'requested') then
        update commerce.shipment_creation_operations set
            status = 'processing', claim_token = gen_random_uuid(), claimed_at = now(),
            claimed_by = p_worker_id, attempts = attempts + 1, last_error = null,
            updated_at = now()
        where id = v_operation.id returning * into v_operation;
    elsif v_operation.status = 'processing'
        and v_operation.claimed_at < now() - interval '5 minutes' then
        update commerce.shipment_creation_operations set
            claim_token = gen_random_uuid(), claimed_at = now(), claimed_by = p_worker_id,
            attempts = attempts + 1, last_error = 'shipment creation lease expired before completion',
            updated_at = now()
        where id = v_operation.id returning * into v_operation;
    end if;
    v_idempotent_replay := v_operation.status = 'succeeded';
    if v_operation.status in ('unknown', 'manual_review', 'cancelled') then
        raise exception 'conflict: shipment creation requires manual reconciliation';
    end if;
    if v_fulfillment.status = 'awaiting_shipment' then
        update commerce.order_fulfillments set status = 'shipment_creating', version = version + 1,
            updated_at = now()
        where order_id = v_order.id and status = 'awaiting_shipment'
        returning * into v_fulfillment;
    end if;
    return jsonb_build_object(
        'operationId', v_operation.id,
        'claimToken', coalesce(v_operation.claim_token, gen_random_uuid()),
        'businessKey', v_operation.business_key,
        'status', v_operation.status,
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'sellerId', v_seller.cms_user_id,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'deliveryQuoteId', v_terms.delivery_quote_id,
        'merchandiseSubtotalMinorAmount', v_terms.merchandise_subtotal_amount,
        'currency', upper(v_terms.currency),
        'financialTermsHash', v_terms.financial_terms_hash,
        'fulfillmentStatus', coalesce(v_fulfillment.status, 'shipment_creating'),
        'idempotentReplay', v_idempotent_replay
    );
end;
$$;
