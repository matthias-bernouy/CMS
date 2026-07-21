\set ON_ERROR_STOP on

begin;
set local role service_role;

create function pg_temp.expect_checkout_constraint(
    p_buyer text,
    p_shipping jsonb,
    p_billing jsonb,
    p_constraint text,
    p_expected_message text
)
returns void language plpgsql set search_path = '' as $$
declare
    v_constraint text;
begin
    begin
        perform commerce.checkout_cart(
            p_buyer, p_buyer || '-key', 1,
            p_shipping, p_billing, '{}'::jsonb
        );
        raise exception 'test: checkout unexpectedly succeeded';
    exception when others then
        get stacked diagnostics v_constraint = constraint_name;
        if sqlerrm = 'test: checkout unexpectedly succeeded'
           or sqlstate <> '23514'
           or sqlerrm <> p_expected_message
           or v_constraint <> p_constraint then
            raise;
        end if;
    end;
end;
$$;

do $checkout_address_limits$
declare
    v_product_id bigint;
    v_seller_a bigint;
    v_seller_b bigint;
    v_offer_a bigint;
    v_offer_b bigint;
    v_large jsonb := jsonb_build_object('value', repeat('x', 65536));
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('checkout-address-product', 'Checkout address product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values
        ('user', 'checkout-address-seller-a', 'checkout-address-seller-a',
            'Checkout address seller A', 'verified', now(), 'checkout-test'),
        ('user', 'checkout-address-seller-b', 'checkout-address-seller-b',
            'Checkout address seller B', 'verified', now(), 'checkout-test');
    select id into strict v_seller_a from commerce.sellers
    where slug = 'checkout-address-seller-a';
    select id into strict v_seller_b from commerce.sellers
    where slug = 'checkout-address-seller-b';
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values
        (v_seller_a, v_product_id, 'checkout-address-offer-a', 'Address offer A',
            'good', 'active', 'approved', 1000, 'eur', 'available', 5),
        (v_seller_b, v_product_id, 'checkout-address-offer-b', 'Address offer B',
            'good', 'active', 'approved', 2000, 'eur', 'unavailable', 5);
    select id into strict v_offer_a from commerce.offers
    where slug = 'checkout-address-offer-a';
    select id into strict v_offer_b from commerce.offers
    where slug = 'checkout-address-offer-b';

    insert into commerce.carts (buyer_cms_user_id, status, currency, version) values
        ('checkout-address-shipping-buyer', 'open', 'eur', 1),
        ('checkout-address-billing-buyer', 'open', 'eur', 1);
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) select cart.id, offer.id, 1, offer.accepted_price_amount, offer.version
      from commerce.carts cart cross join commerce.offers offer
      where cart.buyer_cms_user_id like 'checkout-address-%-buyer'
        and offer.id in (v_offer_a, v_offer_b);
    perform pg_temp.expect_checkout_constraint(
        'checkout-address-shipping-buyer', v_large, '{}'::jsonb,
        'orders_shipping_address_size',
        'new row for relation "orders" violates check constraint "orders_shipping_address_size"'
    );
    perform pg_temp.expect_checkout_constraint(
        'checkout-address-billing-buyer', '{}'::jsonb, v_large,
        'orders_billing_address_size',
        'new row for relation "orders" violates check constraint "orders_billing_address_size"'
    );
    if exists (select 1 from commerce.orders
        where buyer_cms_user_id like 'checkout-address-%-buyer')
       or exists (select 1 from commerce.checkout_groups
           where buyer_cms_user_id like 'checkout-address-%-buyer')
       or exists (select 1 from commerce.carts
           where buyer_cms_user_id like 'checkout-address-%-buyer'
             and (status <> 'open' or version <> 1))
       or exists (select 1 from commerce.offers where id in (v_offer_a, v_offer_b)
           and (quantity_available <> 5 or version <> 1)) then
        raise exception 'checkout address limits: rejected checkout mutated state';
    end if;
end;
$checkout_address_limits$;

rollback;
