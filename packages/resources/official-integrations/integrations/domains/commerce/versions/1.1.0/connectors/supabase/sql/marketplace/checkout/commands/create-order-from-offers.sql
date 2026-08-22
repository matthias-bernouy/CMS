

create or replace function commerce.create_order_from_offers(
    p_buyer_cms_user_id text,
    p_idempotency_key text,
    p_items jsonb,
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
    v_existing commerce.orders%rowtype;
    v_order commerce.orders%rowtype;
    v_canonical_items jsonb;
    v_request_hash text;
    v_offer_ids bigint[];
    v_offer_count integer;
    v_error_message text;
    v_seller_id bigint;
    v_currency text;
    v_subtotal numeric := 0;
begin
    if p_buyer_cms_user_id is null or length(btrim(p_buyer_cms_user_id)) = 0 then
        raise exception 'forbidden: missing CMS user id';
    end if;
    if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
        raise exception 'validation: idempotency key is required';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_buyer_cms_user_id || ':' || p_idempotency_key, 0));
    select * into v_settings from commerce.settings where id = 'default' for share;
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
        raise exception 'validation: order items must contain between 1 and 100 entries';
    end if;
    if exists (
        select 1
        from jsonb_array_elements(p_items) item
        where jsonb_typeof(item) <> 'object'
           or coalesce(item->>'offerId', '') !~ '^[1-9][0-9]{0,17}$'
           or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]{0,3}$'
           or (item->>'quantity')::integer > 1000
    ) then raise exception 'validation: every order item needs a valid offerId and quantity'; end if;
    if exists (
        select 1
        from jsonb_array_elements(p_items) item
        group by item->>'offerId'
        having count(*) > 1
    ) then raise exception 'validation: duplicate offer entries are not allowed'; end if;
    if jsonb_typeof(coalesce(p_shipping_address, '{}'::jsonb)) <> 'object'
        or jsonb_typeof(coalesce(p_billing_address, '{}'::jsonb)) <> 'object' then
        raise exception 'validation: addresses must be objects';
    end if;
    select jsonb_agg(item order by (item->>'offerId')::bigint)
    into v_canonical_items
    from jsonb_array_elements(p_items) item;
    v_request_hash := md5(jsonb_build_object(
        'items', v_canonical_items,
        'shippingAddress', coalesce(p_shipping_address, '{}'::jsonb),
        'billingAddress', coalesce(p_billing_address, '{}'::jsonb),
        'metadata', coalesce(p_metadata, '{}'::jsonb)
    )::text);
    select * into v_existing from commerce.orders
    where buyer_cms_user_id = p_buyer_cms_user_id and idempotency_key = p_idempotency_key;
    if found then
        if v_existing.request_hash <> v_request_hash then
            raise exception 'conflict: idempotency key was already used for a different order';
        end if;
        return to_jsonb(v_existing) || jsonb_build_object('idempotent_replay', true);
    end if;
    perform commerce.assert_custom_fields('order', coalesce(p_metadata, '{}'::jsonb), 'self');

    select array_agg(distinct (item->>'offerId')::bigint order by (item->>'offerId')::bigint)
    into v_offer_ids
    from jsonb_array_elements(p_items) item;
    if v_offer_ids is null then raise exception 'validation: every order item needs an offerId'; end if;
    perform seller.id
    from commerce.sellers seller
    join commerce.offers offer on offer.seller_id = seller.id
    where offer.id = any(v_offer_ids)
    order by seller.id
    for share of seller;
    perform product.id
    from commerce.products product
    join commerce.offers offer on offer.product_id = product.id
    where offer.id = any(v_offer_ids)
    order by product.id
    for share of product;
    perform variant.id
    from commerce.product_variants variant
    join commerce.offers offer on offer.variant_id = variant.id
    where offer.id = any(v_offer_ids)
    order by variant.id
    for share of variant;
    perform state.code
    from commerce.offer_workflow_states state
    join commerce.offers offer on offer.workflow_state = state.code
    where offer.id = any(v_offer_ids)
    order by state.code
    for share of state;
    perform id from commerce.offers where id = any(v_offer_ids) order by id for update;
    get diagnostics v_offer_count = row_count;
    if v_offer_count <> cardinality(v_offer_ids) then
        raise exception 'not_found: offer';
    end if;

    select validation.error_message, validation.order_seller_id,
           validation.order_currency, validation.order_subtotal
    into strict v_error_message, v_seller_id, v_currency, v_subtotal
    from commerce.validate_order_creation_lines(
        p_buyer_cms_user_id,
        p_items,
        v_settings.require_verified_seller,
        v_settings.mode
    ) validation;
    if v_error_message is not null then
        raise exception '%', v_error_message;
    end if;

    insert into commerce.orders (
        order_number, seller_id, buyer_cms_user_id, currency,
        subtotal_amount, total_amount, shipping_address, billing_address,
        metadata, idempotency_key, request_hash
    ) values (
        'CO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
        v_seller_id, p_buyer_cms_user_id, v_currency,
        v_subtotal, v_subtotal, coalesce(p_shipping_address, '{}'::jsonb),
        coalesce(p_billing_address, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb),
        p_idempotency_key, v_request_hash
    ) returning * into v_order;

    perform commerce.insert_order_lines_and_reserve_inventory(v_order.id, p_items);

    insert into commerce.order_events (
        order_id, event_type, actor_kind, actor_id, previous_status, next_status
    ) values (v_order.id, 'order_created', 'buyer', p_buyer_cms_user_id, null, 'awaiting_quote');
    return to_jsonb(v_order) || jsonb_build_object('idempotent_replay', false);
end;
$$;