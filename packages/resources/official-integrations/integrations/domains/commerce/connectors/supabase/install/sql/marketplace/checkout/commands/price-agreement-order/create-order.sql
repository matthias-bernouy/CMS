create or replace function commerce.create_order_from_price_agreement(
    p_buyer_cms_user_id text,
    p_idempotency_key text,
    p_agreement_public_id uuid,
    p_shipping_address jsonb default '{}'::jsonb,
    p_billing_address jsonb default '{}'::jsonb,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_agreement commerce.price_agreements%rowtype;
    v_offer commerce.offers%rowtype;
    v_seller commerce.sellers%rowtype;
    v_order commerce.orders%rowtype;
    v_existing commerce.orders%rowtype;
    v_request_hash text;
    v_subtotal numeric;
begin
    if p_buyer_cms_user_id is null or btrim(p_buyer_cms_user_id) = '' then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
        raise exception 'validation: idempotency key is required';
    end if;
    if p_agreement_public_id is null then
        raise exception 'validation: price agreement id is required';
    end if;
    if jsonb_typeof(coalesce(p_shipping_address, '{}'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(p_billing_address, '{}'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
        raise exception 'validation: checkout objects must be objects';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        p_buyer_cms_user_id || ':' || p_idempotency_key, 0
    ));
    v_request_hash := md5(jsonb_build_object(
        'priceAgreementId', p_agreement_public_id,
        'shippingAddress', coalesce(p_shipping_address, '{}'::jsonb),
        'billingAddress', coalesce(p_billing_address, '{}'::jsonb),
        'metadata', coalesce(p_metadata, '{}'::jsonb)
    )::text);
    select * into v_agreement
    from commerce.price_agreements
    where public_id = p_agreement_public_id
    for update;
    if not found then raise exception 'not_found: price agreement'; end if;
    if v_agreement.buyer_cms_user_id <> p_buyer_cms_user_id then
        raise exception 'forbidden: price agreement does not belong to this buyer';
    end if;
    if v_agreement.status = 'consumed' then
        select * into v_existing
        from commerce.orders
        where id = v_agreement.order_id;
        if not found or v_existing.buyer_cms_user_id <> p_buyer_cms_user_id then
            raise exception 'conflict: consumed price agreement has no buyer order';
        end if;
        if v_existing.request_hash <> v_request_hash then
            raise exception 'conflict: price agreement was already consumed with different checkout data';
        end if;
        return to_jsonb(v_existing) || jsonb_build_object('idempotent_replay', true);
    end if;
    if v_agreement.status = 'active' and v_agreement.expires_at <= now() then
        update commerce.price_agreements
        set status = 'expired'
        where id = v_agreement.id;
        raise exception 'conflict: price agreement has expired';
    end if;
    if v_agreement.status <> 'active' then
        raise exception 'conflict: price agreement is not active';
    end if;
    select * into v_settings
    from commerce.settings
    where id = 'default'
    for share;
    select * into v_seller
    from commerce.sellers
    where id = v_agreement.seller_id
    for share;
    if not found then raise exception 'not_found: seller'; end if;
    perform product.id
    from commerce.products product
    join commerce.offers offer on offer.product_id = product.id
    where offer.id = v_agreement.offer_id
    for share of product;
    perform variant.id
    from commerce.product_variants variant
    join commerce.offers offer on offer.variant_id = variant.id
    where offer.id = v_agreement.offer_id
    for share of variant;
    perform state.code
    from commerce.offer_workflow_states state
    join commerce.offers offer on offer.workflow_state = state.code
    where offer.id = v_agreement.offer_id
    for share of state;
    select * into v_offer
    from commerce.offers
    where id = v_agreement.offer_id
    for update;
    if not found or v_offer.seller_id <> v_agreement.seller_id then
        raise exception 'conflict: price agreement offer identity changed';
    end if;
    if v_offer.publication_status <> 'active'
        or v_offer.availability <> 'available'
        or not exists (
            select 1 from commerce.offer_workflow_states state
            where state.code = v_offer.workflow_state
              and state.phase = 'ready'
              and state.enabled
        ) then
        raise exception 'conflict: price agreement offer is not sellable';
    end if;
    if v_offer.currency <> v_agreement.currency then
        raise exception 'conflict: price agreement currency no longer matches the offer';
    end if;
    if v_offer.quantity_available is not null
        and v_offer.quantity_available < v_agreement.quantity then
        raise exception 'conflict: insufficient quantity for price agreement';
    end if;
    if not exists (
        select 1 from commerce.products product
        where product.id = v_offer.product_id
          and product.status = 'active'
          and product.visibility = 'public'
    ) then
        raise exception 'conflict: price agreement product is not sellable';
    end if;
    perform commerce.assert_product_variant_ready(v_offer.product_id, v_offer.variant_id);
    if v_seller.verification_status in ('rejected', 'suspended')
        or (v_settings.require_verified_seller
            and v_seller.verification_status <> 'verified') then
        raise exception 'conflict: price agreement seller is not allowed to sell';
    end if;
    if v_settings.mode = 'ecommerce' and v_seller.kind = 'user' then
        raise exception 'conflict: marketplace offers are disabled';
    end if;
    perform commerce.assert_required_seller_sale_capabilities(v_seller.id);
    perform commerce.assert_custom_fields(
        'order', coalesce(p_metadata, '{}'::jsonb), 'self'
    );
    perform commerce.assert_order_address_sizes(
        coalesce(p_shipping_address, '{}'::jsonb),
        coalesce(p_billing_address, '{}'::jsonb)
    );
    select * into v_existing
    from commerce.orders
    where buyer_cms_user_id = p_buyer_cms_user_id
      and idempotency_key = p_idempotency_key
    limit 1;
    if found then
        raise exception 'conflict: idempotency key was already used for another order';
    end if;
    v_subtotal := v_agreement.unit_amount::numeric * v_agreement.quantity;
    if v_subtotal > 9007199254740991 then
        raise exception 'validation: order total exceeds the supported maximum';
    end if;
    insert into commerce.orders (
        order_number, seller_id, buyer_cms_user_id, currency,
        subtotal_amount, total_amount, shipping_address, billing_address,
        metadata, idempotency_key, request_hash
    ) values (
        'CO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
        v_agreement.seller_id, p_buyer_cms_user_id, v_agreement.currency,
        v_subtotal, v_subtotal,
        coalesce(p_shipping_address, '{}'::jsonb),
        coalesce(p_billing_address, '{}'::jsonb),
        coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key, v_request_hash
    ) returning * into v_order;

    perform commerce.insert_price_agreement_order_line(v_order.id, v_agreement.id);
    update commerce.price_agreements
    set status = 'consumed', order_id = v_order.id, consumed_at = now()
    where id = v_agreement.id;
    insert into commerce.order_events (
        order_id, event_type, actor_kind, actor_id, previous_status, next_status,
        data
    ) values (
        v_order.id, 'order_created', 'buyer', p_buyer_cms_user_id,
        null, 'awaiting_quote',
        jsonb_build_object('priceAgreementId', v_agreement.public_id)
    );
    return to_jsonb(v_order) || jsonb_build_object('idempotent_replay', false);
end;
$$;
