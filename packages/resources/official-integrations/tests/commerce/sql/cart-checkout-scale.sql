\set ON_ERROR_STOP on

begin;
set local role service_role;

do $checkout_scale$
declare
    v_product_id bigint;
    v_cart_id bigint;
    v_group_id uuid;
    v_result jsonb;
    v_replay jsonb;
    v_expected jsonb;
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('checkout-scale-product', 'Checkout scale product', 'active', 'public')
    returning id into v_product_id;

    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    )
    select 'user', 'checkout-scale-seller-' || to_char(number, 'FM000'),
        'checkout-scale-seller-' || to_char(number, 'FM000'),
        'Checkout scale seller ' || number,
        'verified', now(), 'checkout-scale-test'
    from generate_series(1, 100) number;

    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    )
    select seller.id, v_product_id,
        'checkout-scale-offer-' || right(seller.slug, 3),
        'Checkout scale offer ' || right(seller.slug, 3),
        'good', 'active', 'approved',
        1000 + right(seller.slug, 3)::integer,
        'eur', 'available', 2
    from commerce.sellers seller
    where seller.slug like 'checkout-scale-seller-%'
    order by seller.id;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) select seller.id, v_product_id, 'checkout-scale-offer-001-extra',
        'Checkout scale offer 001 extra', 'good', 'active', 'approved',
        1501, 'eur', 'available', 2
      from commerce.sellers seller where seller.slug = 'checkout-scale-seller-001';

    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-scale-buyer', 'open', 'eur', 7)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    )
    select v_cart_id, offer.id, 1, offer.accepted_price_amount, offer.version
    from commerce.offers offer
    where offer.slug like 'checkout-scale-offer-%'
    order by offer.id;

    v_result := commerce.checkout_cart(
        'checkout-scale-buyer', 'checkout-scale-key', 7,
        '{"city":"Paris","line1":null}'::jsonb,
        '{"city":"Lyon"}'::jsonb,
        '{}'::jsonb
    );
    v_group_id := (v_result->>'checkout_group_id')::uuid;
    select jsonb_build_object(
        'checkout_group_id', v_group_id,
        'orders', jsonb_agg((to_jsonb(order_row) - 'request_hash') order by order_row.id),
        'idempotent_replay', false
    ) into v_expected
    from commerce.orders order_row where checkout_group_id = v_group_id;

    if v_result is distinct from v_expected
       or jsonb_array_length(v_result->'orders') <> 100
       or (select count(*) from commerce.checkout_groups
           where buyer_cms_user_id = 'checkout-scale-buyer') <> 1
       or exists (select 1 from commerce.checkout_groups
           where buyer_cms_user_id = 'checkout-scale-buyer' and source_cart_id is null)
       or (select source_cart_id from commerce.checkout_groups where id = v_group_id)
          is distinct from v_cart_id
       or (select array_agg(order_row.seller_id order by order_row.id)
           from commerce.orders order_row where checkout_group_id = v_group_id)
          is distinct from (select array_agg(seller.id order by seller.id)
              from commerce.sellers seller where seller.slug like 'checkout-scale-seller-%')
       or exists (
           select 1 from commerce.orders order_row
           where order_row.checkout_group_id = v_group_id and (
               order_row.version <> 2 or order_row.status <> 'awaiting_quote'
               or order_row.currency <> 'eur' or order_row.idempotency_key <> 'checkout-scale-key'
               or order_row.order_number !~ '^CO-[A-F0-9]{24}$'
               or order_row.created_at is distinct from order_row.updated_at
               or order_row.shipping_address <> '{"city":"Paris","line1":null}'::jsonb
               or order_row.billing_address <> '{"city":"Lyon"}'::jsonb
               or order_row.metadata <> '{}'::jsonb
               or order_row.idempotency_key <> (select idempotency_key
                   from commerce.checkout_groups where id = v_group_id)
               or order_row.request_hash <> (select request_hash
                   from commerce.checkout_groups where id = v_group_id)
           )
       ) or (select count(distinct order_number) from commerce.orders
             where checkout_group_id = v_group_id) <> 100
       or (select count(*) from commerce.order_lines line
           join commerce.orders order_row on order_row.id = line.order_id
           where order_row.checkout_group_id = v_group_id) <> 101
       or (select array_agg(line.offer_id order by line.id)
           from commerce.order_lines line
           join commerce.orders order_row on order_row.id = line.order_id
           where order_row.checkout_group_id = v_group_id)
          is distinct from (select array_agg(offer.id order by offer.seller_id, offer.id)
              from commerce.offers offer where offer.slug like 'checkout-scale-offer-%')
       or exists (select 1 from commerce.order_lines line
           join commerce.orders order_row on order_row.id = line.order_id
           where order_row.checkout_group_id = v_group_id
             and line.seller_id <> order_row.seller_id)
       or (select count(*) from commerce.order_events event
           join commerce.orders order_row on order_row.id = event.order_id
           where order_row.checkout_group_id = v_group_id
             and event.event_type = 'order_created') <> 100
       or exists (select 1 from commerce.offers where slug like 'checkout-scale-offer-%'
           and (quantity_available <> 1 or availability <> 'available'
             or inventory_revision <> 1 or version <> 2))
       or (select (status, version, converted_at is not null)
           from commerce.carts where id = v_cart_id)
          is distinct from row('converted'::text, 8, true) then
        raise exception 'checkout scale: final contract changed: %', v_result;
    end if;

    v_replay := commerce.checkout_cart(
        'checkout-scale-buyer', 'checkout-scale-key', 7,
        '{"city":"Paris","line1":null}'::jsonb,
        '{"city":"Lyon"}'::jsonb,
        '{}'::jsonb
    );
    v_expected := jsonb_set(v_expected, '{idempotent_replay}', 'true'::jsonb);
    if v_replay is distinct from v_expected
       or (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 100
       or exists (select 1 from commerce.offers where slug like 'checkout-scale-offer-%'
           and (quantity_available <> 1 or version <> 2))
       or (select version from commerce.carts where id = v_cart_id) <> 8 then
        raise exception 'checkout scale: replay contract changed: %', v_replay;
    end if;
end;
$checkout_scale$;

rollback;
