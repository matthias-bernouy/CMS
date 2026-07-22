\set ON_ERROR_STOP on

begin;
set local role service_role;

create function pg_temp.expect_checkout_error(
    p_buyer text,
    p_key text,
    p_version integer,
    p_expected text,
    p_shipping jsonb default '{}'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    begin
        perform commerce.checkout_cart(
            p_buyer, p_key, p_version, p_shipping, '{}'::jsonb, '{}'::jsonb
        );
        raise exception 'test: checkout unexpectedly succeeded';
    exception when others then
        if sqlerrm = 'test: checkout unexpectedly succeeded'
           or sqlerrm <> p_expected then
            raise;
        end if;
    end;
end;
$$;

do $checkout_boundaries$
declare
    v_product_id bigint;
    v_seller_a bigint;
    v_seller_b bigint;
    v_seller_c bigint;
    v_valid bigint;
    v_later_invalid bigint;
    v_lower_invalid bigint;
    v_higher_invalid bigint;
    v_cart_id bigint;
    v_group_id uuid;
    v_initial jsonb;
    v_replay jsonb;
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('checkout-boundary-product', 'Checkout boundary product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values
        ('user', 'checkout-boundary-seller-a', 'checkout-boundary-seller-a',
            'Checkout boundary seller A', 'verified', now(), 'checkout-test'),
        ('user', 'checkout-boundary-seller-b', 'checkout-boundary-seller-b',
            'Checkout boundary seller B', 'verified', now(), 'checkout-test'),
        ('user', 'checkout-boundary-seller-c', 'checkout-boundary-seller-c',
            'Checkout boundary seller C', 'verified', now(), 'checkout-test');
    select id into strict v_seller_a from commerce.sellers
    where slug = 'checkout-boundary-seller-a';
    select id into strict v_seller_b from commerce.sellers
    where slug = 'checkout-boundary-seller-b';
    select id into strict v_seller_c from commerce.sellers
    where slug = 'checkout-boundary-seller-c';

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values
        (v_seller_a, v_product_id, 'checkout-boundary-valid', 'Boundary valid',
            'good', 'active', 'approved', 1000, 'eur', 'available', 5),
        (v_seller_b, v_product_id, 'checkout-boundary-later-invalid',
            'Boundary later invalid', 'good', 'active', 'approved', 2000,
            'eur', 'unavailable', 5),
        (v_seller_c, v_product_id, 'checkout-boundary-lower-invalid',
            'Boundary lower invalid', 'good', 'active', 'approved', 3000,
            'eur', 'unavailable', 5),
        (v_seller_c, v_product_id, 'checkout-boundary-higher-invalid',
            'Boundary higher invalid', 'good', 'active', 'approved', 4000,
            'eur', 'available', 0);
    select id into strict v_valid from commerce.offers
    where slug = 'checkout-boundary-valid';
    select id into strict v_later_invalid from commerce.offers
    where slug = 'checkout-boundary-later-invalid';
    select id into strict v_lower_invalid from commerce.offers
    where slug = 'checkout-boundary-lower-invalid';
    select id into strict v_higher_invalid from commerce.offers
    where slug = 'checkout-boundary-higher-invalid';

    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-boundary-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) select v_cart_id, offer.id, 1, offer.accepted_price_amount, offer.version
      from commerce.offers offer where offer.id in (v_valid, v_later_invalid)
      order by offer.id;

    perform pg_temp.expect_checkout_error(
        'checkout-boundary-buyer', 'checkout-boundary-error', 1,
        format('conflict: offer %s is not sellable', v_later_invalid)
    );
    if exists (select 1 from commerce.orders
        where buyer_cms_user_id = 'checkout-boundary-buyer')
       or exists (select 1 from commerce.checkout_groups
           where buyer_cms_user_id = 'checkout-boundary-buyer')
       or (select (status, version) from commerce.carts where id = v_cart_id)
          is distinct from row('open'::text, 1)
       or (select quantity_available from commerce.offers where id = v_valid) <> 5 then
        raise exception 'checkout boundaries: rejected later seller left partial state';
    end if;

    update commerce.offers set currency = 'usd' where id = v_later_invalid;
    perform pg_temp.expect_checkout_error(
        'checkout-boundary-buyer', 'checkout-boundary-currency', 1,
        'conflict: one cart cannot contain multiple currencies'
    );
    update commerce.offers set currency = 'eur' where id = v_later_invalid;

    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-order-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values
        (v_cart_id, v_higher_invalid, 1, 4000, 1),
        (v_cart_id, v_lower_invalid, 1, 3000, 1);
    perform pg_temp.expect_checkout_error(
        'checkout-order-buyer', 'checkout-order-error', 1,
        format('conflict: offer %s is not sellable', v_lower_invalid)
    );

    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-hash-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values (v_cart_id, v_valid, 1, 1000, 1);
    v_initial := commerce.checkout_cart(
        'checkout-hash-buyer', 'checkout-hash-key', 1, '{"city":"Paris"}'::jsonb
    );
    v_group_id := (v_initial->>'checkout_group_id')::uuid;
    perform pg_temp.expect_checkout_error(
        'checkout-hash-buyer', 'checkout-hash-key', 1,
        'conflict: idempotency key was already used for a different checkout',
        '{"city":"Nice"}'::jsonb
    );
    if (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce.checkout_groups
           where buyer_cms_user_id = 'checkout-hash-buyer') <> 1
       or (select quantity_available from commerce.offers where id = v_valid) <> 4 then
        raise exception 'checkout boundaries: changed replay mutated state';
    end if;

    update commerce.offers set availability = 'unavailable' where id = v_valid;
    v_replay := commerce.checkout_cart(
        'checkout-hash-buyer', 'checkout-hash-key', null, '{"city":"Paris"}'::jsonb
    );
    if v_replay is distinct from jsonb_set(
        v_initial, '{idempotent_replay}', 'true'::jsonb
    ) or (select (quantity_available, availability, version) from commerce.offers
        where id = v_valid) is distinct from row(4, 'unavailable'::text, 3)
      or (select version from commerce.carts where id = v_cart_id) <> 2 then
        raise exception 'checkout boundaries: replay revalidated or mutated state';
    end if;
end;
$checkout_boundaries$;

rollback;
