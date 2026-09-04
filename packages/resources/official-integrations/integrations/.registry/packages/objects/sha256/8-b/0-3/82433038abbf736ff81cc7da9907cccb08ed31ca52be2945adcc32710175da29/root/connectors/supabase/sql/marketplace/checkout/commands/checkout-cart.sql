

create or replace function commerce.checkout_cart(
    p_buyer_cms_user_id text,
    p_idempotency_key text,
    p_expected_version integer,
    p_shipping_address jsonb default '{}'::jsonb,
    p_billing_address jsonb default '{}'::jsonb,
    p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_cart commerce.carts%rowtype;
    v_group commerce.checkout_groups%rowtype;
    v_items jsonb;
    v_request_hash text;
    v_error_message text;
    v_order_summaries jsonb;
    v_currency_count integer;
begin
    if p_buyer_cms_user_id is null or length(btrim(p_buyer_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
        raise exception 'validation: idempotency key is required';
    end if;
    if jsonb_typeof(coalesce(p_shipping_address, '{}'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(p_billing_address, '{}'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
        raise exception 'validation: checkout objects are invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
        p_buyer_cms_user_id || ':' || p_idempotency_key, 0
    ));
    select * into v_group from commerce.checkout_groups
    where buyer_cms_user_id = p_buyer_cms_user_id
      and idempotency_key = p_idempotency_key;
    if found then
        if v_group.source_cart_id is null then
            raise exception 'conflict: idempotency key was already used outside this cart';
        end if;
        select * into v_cart from commerce.carts
        where id = v_group.source_cart_id and buyer_cms_user_id = p_buyer_cms_user_id;
    else
        select * into v_cart from commerce.carts
        where buyer_cms_user_id = p_buyer_cms_user_id and status = 'open'
        for update;
        if not found then raise exception 'not_found: cart'; end if;
        if p_expected_version is null or v_cart.version is distinct from p_expected_version then
            raise exception 'conflict: stale cart version';
        end if;
    end if;
    select jsonb_agg(jsonb_build_object(
        'offerId', offer_id,
        'quantity', quantity
    ) order by offer_id)
    into v_items
    from commerce.cart_items
    where cart_id = v_cart.id;
    if v_items is null or jsonb_array_length(v_items) = 0 then
        raise exception 'validation: cart is empty';
    end if;
    v_request_hash := md5(jsonb_build_object(
        'sourceCartId', v_cart.id,
        'items', v_items,
        'shippingAddress', coalesce(p_shipping_address, '{}'::jsonb),
        'billingAddress', coalesce(p_billing_address, '{}'::jsonb),
        'metadata', coalesce(p_metadata, '{}'::jsonb)
    )::text);
    if v_group.id is not null then
        if v_group.request_hash <> v_request_hash then
            raise exception 'conflict: idempotency key was already used for a different checkout';
        end if;
        return commerce.checkout_group_result(v_group.id, true);
    end if;
    select * into v_settings
    from commerce.settings where id = 'default' for share;
    perform seller.id
    from commerce.sellers seller
    where seller.id in (
        select offer.seller_id
        from commerce.offers offer
        join commerce.cart_items item on item.offer_id = offer.id
        where item.cart_id = v_cart.id
    )
    order by seller.id
    for share;
    perform product.id
    from commerce.products product
    where product.id in (
        select offer.product_id
        from commerce.offers offer
        join commerce.cart_items item on item.offer_id = offer.id
        where item.cart_id = v_cart.id
    )
    order by product.id
    for share;
    perform variant.id
    from commerce.product_variants variant
    where variant.id in (
        select offer.variant_id
        from commerce.offers offer
        join commerce.cart_items item on item.offer_id = offer.id
        where item.cart_id = v_cart.id and offer.variant_id is not null
    )
    order by variant.id
    for share;
    perform state.code
    from commerce.offer_workflow_states state
    where state.code in (
        select offer.workflow_state
        from commerce.offers offer
        join commerce.cart_items item on item.offer_id = offer.id
        where item.cart_id = v_cart.id
    )
    order by state.code
    for share;
    perform offer.id
    from commerce.offers offer
    join commerce.cart_items item on item.offer_id = offer.id
    where item.cart_id = v_cart.id
    order by offer.id
    for update of offer;
    select count(distinct offer.currency) into v_currency_count
    from commerce.offers offer
    join commerce.cart_items item on item.offer_id = offer.id
    where item.cart_id = v_cart.id;
    if v_currency_count <> 1 then
        raise exception 'conflict: one cart cannot contain multiple currencies';
    end if;
    insert into commerce.checkout_groups (
        buyer_cms_user_id, source_cart_id, idempotency_key, request_hash
    ) values (
        p_buyer_cms_user_id, v_cart.id, p_idempotency_key, v_request_hash
    ) returning * into v_group;
    select validation.error_message, validation.order_summaries
    into strict v_error_message, v_order_summaries
    from commerce.validate_order_creation_batches(
        p_buyer_cms_user_id,
        v_items,
        v_settings.require_verified_seller,
        v_settings.mode,
        true
    ) validation;
    if (v_order_summaries->0->>'itemCount')::integer > 100 then
        raise exception 'validation: order items must contain between 1 and 100 entries';
    end if;
    perform commerce.assert_custom_fields('order', coalesce(p_metadata, '{}'::jsonb), 'self');
    if v_order_summaries->0->>'error' is not null then
        raise exception '%', v_order_summaries->0->>'error';
    end if;
    perform commerce.assert_order_address_sizes(
        coalesce(p_shipping_address, '{}'::jsonb),
        coalesce(p_billing_address, '{}'::jsonb)
    );
    if v_error_message is not null then
        raise exception '%', v_error_message;
    end if;
    perform commerce.create_checkout_orders(
        v_group.id,
        p_buyer_cms_user_id,
        p_idempotency_key,
        v_request_hash,
        coalesce(p_shipping_address, '{}'::jsonb),
        coalesce(p_billing_address, '{}'::jsonb),
        coalesce(p_metadata, '{}'::jsonb),
        v_order_summaries,
        v_items
    );
    update commerce.carts
    set status = 'converted', converted_at = now()
    where id = v_cart.id;
    return commerce.checkout_group_result(v_group.id, false);
end;
$$;