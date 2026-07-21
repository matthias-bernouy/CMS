\set ON_ERROR_STOP on

begin;
set local role service_role;

create function pg_temp.expect_checkout_error(
    p_buyer text,
    p_key text,
    p_expected text,
    p_metadata jsonb default '{}'::jsonb
)
returns void language plpgsql set search_path = '' as $$
begin
    begin
        perform commerce.checkout_cart(
            p_buyer, p_key, 1, '{}'::jsonb, '{}'::jsonb, p_metadata
        );
        raise exception 'test: checkout unexpectedly succeeded';
    exception when others then
        if sqlerrm = 'test: checkout unexpectedly succeeded'
           or sqlerrm <> p_expected then raise; end if;
    end;
end;
$$;

do $checkout_limits$
declare
    v_product_id bigint;
    v_seller_a bigint;
    v_seller_b bigint;
    v_offer_a bigint;
    v_offer_b bigint;
    v_cart_id bigint;
    v_result jsonb;
    v_group_id uuid;
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('checkout-limits-product', 'Checkout limits product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values
        ('user', 'checkout-limits-seller-a', 'checkout-limits-seller-a',
            'Checkout limits seller A', 'verified', now(), 'checkout-test'),
        ('user', 'checkout-limits-seller-b', 'checkout-limits-seller-b',
            'Checkout limits seller B', 'verified', now(), 'checkout-test');
    select id into strict v_seller_a from commerce.sellers
    where slug = 'checkout-limits-seller-a';
    select id into strict v_seller_b from commerce.sellers
    where slug = 'checkout-limits-seller-b';

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) select v_seller_a, v_product_id,
        'checkout-limits-many-' || to_char(number, 'FM000'),
        'Checkout limits many ' || number, 'good', 'active', 'approved',
        1, 'eur', 'available', null
      from generate_series(1, 101) number;
    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-limits-many-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) select v_cart_id, offer.id, 1, 1, offer.version from commerce.offers offer
      where offer.slug like 'checkout-limits-many-%';
    perform pg_temp.expect_checkout_error(
        'checkout-limits-many-buyer', 'checkout-limits-many-key',
        'validation: order items must contain between 1 and 100 entries',
        '{"unknown":true}'::jsonb
    );

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_b, v_product_id, 'checkout-limits-error-b', 'Limits error B',
        'good', 'active', 'approved', 1, 'eur', 'unavailable', 1
    ) returning id into v_offer_b;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_a, v_product_id, 'checkout-limits-error-a', 'Limits error A',
        'good', 'active', 'approved', 1, 'eur', 'unavailable', 1
    ) returning id into v_offer_a;
    if v_offer_a <= v_offer_b or v_seller_a >= v_seller_b then
        raise exception 'checkout limits: fixture does not oppose seller and offer order';
    end if;
    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-limits-order-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values (v_cart_id, v_offer_b, 1, 1, 1), (v_cart_id, v_offer_a, 1, 1, 1);
    perform pg_temp.expect_checkout_error(
        'checkout-limits-order-buyer', 'checkout-limits-order-key',
        format('conflict: offer %s is not sellable', v_offer_a)
    );

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values
        (v_seller_a, v_product_id, 'checkout-limits-total-a', 'Limits total A',
            'good', 'active', 'approved', 9007199254740991, 'eur', 'available', null),
        (v_seller_b, v_product_id, 'checkout-limits-total-b', 'Limits total B',
            'good', 'active', 'approved', 9007199254740991, 'eur', 'available', null);
    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-limits-total-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) select v_cart_id, offer.id, 1, offer.accepted_price_amount, offer.version
      from commerce.offers offer where offer.slug like 'checkout-limits-total-%';
    v_result := commerce.checkout_cart(
        'checkout-limits-total-buyer', 'checkout-limits-total-key', 1
    );
    v_group_id := (v_result->>'checkout_group_id')::uuid;
    if jsonb_array_length(v_result->'orders') <> 2
       or exists (select 1 from commerce.orders where checkout_group_id = v_group_id
           and (subtotal_amount <> 9007199254740991
             or total_amount <> 9007199254740991))
       or (select sum(subtotal_amount) from commerce.orders
           where checkout_group_id = v_group_id) <> 18014398509481982 then
        raise exception 'checkout limits: per-order total ceiling changed';
    end if;
end;
$checkout_limits$;

rollback;
