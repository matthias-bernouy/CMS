\set ON_ERROR_STOP on

\ir ../../order/create-from-offers/postgres/cleanup.sql

begin;
set local role service_role;
\ir ../../order/create-from-offers/postgres/fixture.sql

do $checkout_snapshots$
declare
    v_cart_id bigint;
    v_group_id uuid;
    v_order commerce.orders%rowtype;
    v_single commerce.order_lines%rowtype;
    v_unlimited commerce.order_lines%rowtype;
    v_single_offer commerce.offers%rowtype;
    v_unlimited_offer commerce.offers%rowtype;
    v_variant commerce.product_variants%rowtype;
    v_proposal_id bigint;
begin
    select * into strict v_single_offer from commerce.offers
    where slug = 'order-create-single';
    select * into strict v_unlimited_offer from commerce.offers
    where slug = 'order-create-unlimited';
    select * into strict v_variant from commerce.product_variants
    where id = v_single_offer.variant_id;
    select id into strict v_proposal_id from commerce.offer_price_proposals
    where offer_id = v_single_offer.id and status = 'accepted';

    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-snapshot-buyer', 'open', 'eur', 4)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values
        (v_cart_id, v_unlimited_offer.id, 3,
            v_unlimited_offer.accepted_price_amount, v_unlimited_offer.version),
        (v_cart_id, v_single_offer.id, 2,
            v_single_offer.accepted_price_amount, v_single_offer.version);
    v_group_id := (commerce.checkout_cart(
        'checkout-snapshot-buyer', 'checkout-snapshot-key', 4,
        '{"city":"Paris"}'::jsonb, '{"city":"Lyon"}'::jsonb, '{}'::jsonb
    )->>'checkout_group_id')::uuid;

    select * into strict v_order from commerce.orders where checkout_group_id = v_group_id;
    select * into strict v_single from commerce.order_lines
    where order_id = v_order.id and offer_id = v_single_offer.id;
    select * into strict v_unlimited from commerce.order_lines
    where order_id = v_order.id and offer_id = v_unlimited_offer.id;
    if v_order.version <> 2 or v_order.subtotal_amount <> 31590
       or v_order.total_amount <> 31590 or v_order.shipping_amount <> 0
       or v_order.shipping_address <> '{"city":"Paris"}'::jsonb
       or v_order.billing_address <> '{"city":"Lyon"}'::jsonb
       or v_single.accepted_proposal_id <> v_proposal_id
       or v_single.variant_id <> v_variant.id
       or v_single.sku <> 'ORDER-CREATE-SINGLE-SKU'
       or (v_single.quantity, v_single.inventory_reserved,
           v_single.inventory_revision_before, v_single.unit_amount,
           v_single.total_amount) is distinct from row(2, 2, 11, 12345::bigint, 24690::bigint)
       or v_single.availability_before <> 'available'
       or v_single.product_snapshot <> jsonb_build_object(
           'id', v_single_offer.product_id,
           'slug', 'order-create-single-product', 'title', 'Single Product')
       or v_single.variant_snapshot <> jsonb_build_object(
           'id', v_variant.id, 'sku', v_variant.sku, 'title', v_variant.title,
           'combinationKey', v_variant.combination_key,
           'options', jsonb_build_array(
               jsonb_build_object('axisKey', 'size', 'axisLabel', 'Size',
                   'valueKey', 'm', 'valueLabel', 'Medium'),
               jsonb_build_object('axisKey', 'color', 'axisLabel', 'Color',
                   'valueKey', 'blue', 'valueLabel', 'Blue')))
       or v_single.offer_snapshot <> jsonb_build_object(
           'id', v_single_offer.id, 'slug', v_single_offer.slug,
           'title', v_single_offer.title, 'conditionCode', 'very_good',
           'acceptedPriceAmount', 12345, 'currency', 'eur')
       or v_single.seller_snapshot <> jsonb_build_object(
           'id', v_single_offer.seller_id, 'kind', 'user',
           'slug', 'order-create-seller', 'displayName', 'Order Create Seller') then
        raise exception 'checkout snapshots: finite line contract changed: %',
            to_jsonb(v_single);
    end if;

    if v_unlimited.accepted_proposal_id is not null
       or v_unlimited.variant_id is not null or v_unlimited.variant_snapshot is not null
       or (v_unlimited.quantity, v_unlimited.inventory_reserved,
           v_unlimited.availability_before, v_unlimited.inventory_revision_before,
           v_unlimited.unit_amount, v_unlimited.total_amount)
          is distinct from row(3, 0, null::text, null::integer, 2300::bigint, 6900::bigint)
       or (select (quantity_available, availability, inventory_revision, version)
           from commerce.offers where id = v_unlimited_offer.id)
          is distinct from row(null::integer, 'preorder'::text, 23, 1)
       or (select (quantity_available, availability, inventory_revision, version)
           from commerce.offers where id = v_single_offer.id)
          is distinct from row(5, 'available'::text, 11, 2)
       or (select array_agg(offer_id order by id) from commerce.order_lines
           where order_id = v_order.id)
          is distinct from array[v_single_offer.id, v_unlimited_offer.id]
       or not exists (select 1 from commerce.order_events where order_id = v_order.id
           and event_type = 'order_created' and actor_kind = 'buyer'
           and actor_id = 'checkout-snapshot-buyer' and previous_status is null
           and next_status = 'awaiting_quote' and message is null and data = '{}')
       or (select count(*) from commerce.order_events where order_id = v_order.id) <> 1 then
        raise exception 'checkout snapshots: unlimited line or event contract changed';
    end if;
end;
$checkout_snapshots$;

rollback;
