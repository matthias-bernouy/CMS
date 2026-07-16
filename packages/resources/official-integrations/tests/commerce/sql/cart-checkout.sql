\set ON_ERROR_STOP on

begin;
set local role service_role;

do $$
declare
    v_product_id bigint;
    v_seller_a bigint;
    v_seller_b bigint;
    v_offer_a bigint;
    v_offer_b bigint;
    v_cart jsonb;
    v_checkout jsonb;
    v_replay jsonb;
    v_version integer;
    v_group_id uuid;
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('cart-product', 'Cart product', 'active', 'public')
    returning id into v_product_id;

    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values (
        'user', 'cart-seller-a', 'cart-seller-a', 'Cart seller A',
        'verified', now(), 'cart-test'
    ) returning id into v_seller_a;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values (
        'user', 'cart-seller-b', 'cart-seller-b', 'Cart seller B',
        'verified', now(), 'cart-test'
    ) returning id into v_seller_b;

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_a, v_product_id, 'cart-offer-a', 'Cart offer A', 'good',
        'active', 'approved', 1000, 'eur', 'available', 5
    ) returning id into v_offer_a;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_b, v_product_id, 'cart-offer-b', 'Cart offer B', 'good',
        'active', 'approved', 2000, 'eur', 'available', 5
    ) returning id into v_offer_b;

    v_cart := commerce.upsert_cart_item('cart-buyer', v_offer_a, 2, null);
    v_version := (v_cart->>'version')::integer;
    begin
        perform commerce.upsert_cart_item('cart-buyer', v_offer_b, 1, null);
        raise exception 'cart smoke: existing cart accepted a missing version';
    exception when others then
        if sqlerrm = 'cart smoke: existing cart accepted a missing version'
            or sqlerrm not like 'validation: expected cart version is required%' then
            raise;
        end if;
    end;
    v_cart := commerce.upsert_cart_item('cart-buyer', v_offer_b, 1, v_version);
    v_version := (v_cart->>'version')::integer;
    if jsonb_array_length(v_cart->'items') <> 2
        or jsonb_array_length(v_cart->'seller_groups') <> 2
        or jsonb_array_length(v_cart->'issues') <> 0
        or (v_cart->>'subtotal_amount')::bigint <> 4000
        or (select quantity_available from commerce.offers where id = v_offer_a) <> 5
        or (select quantity_available from commerce.offers where id = v_offer_b) <> 5 then
        raise exception 'cart smoke: invalid cart projection %', v_cart;
    end if;

    update commerce.offers set accepted_price_amount = 1100 where id = v_offer_a;
    v_cart := commerce.get_cart('cart-buyer');
    if not (v_cart->'issues' ? 'price_changed')
        or (v_cart->>'subtotal_amount')::bigint <> 4200 then
        raise exception 'cart smoke: current price was not projected %', v_cart;
    end if;

    v_checkout := commerce.checkout_cart(
        'cart-buyer', 'cart-checkout', v_version,
        '{"city":"Paris"}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
    v_group_id := (v_checkout->>'checkout_group_id')::uuid;
    if (v_checkout->>'idempotent_replay')::boolean
        or jsonb_array_length(v_checkout->'orders') <> 2 then
        raise exception 'cart smoke: invalid checkout %', v_checkout;
    end if;
    if (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 2
        or (select count(distinct seller_id) from commerce.orders where checkout_group_id = v_group_id) <> 2
        or (select count(*) from commerce.checkout_groups where buyer_cms_user_id = 'cart-buyer') <> 1
        or (select count(distinct idempotency_key) from commerce.orders where checkout_group_id = v_group_id) <> 1
        or (select status from commerce.carts where buyer_cms_user_id = 'cart-buyer') <> 'converted'
        or (select unit_amount from commerce.order_lines where offer_id = v_offer_a) <> 1100
        or (select quantity_available from commerce.offers where id = v_offer_a) <> 3
        or (select quantity_available from commerce.offers where id = v_offer_b) <> 4 then
        raise exception 'cart smoke: checkout state is inconsistent';
    end if;

    v_replay := commerce.checkout_cart(
        'cart-buyer', 'cart-checkout', v_version,
        '{"city":"Paris"}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
    if not (v_replay->>'idempotent_replay')::boolean
        or jsonb_array_length(v_replay->'orders') <> 2
        or (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 2 then
        raise exception 'cart smoke: idempotent replay failed %', v_replay;
    end if;
end;
$$;

rollback;
