do $single_contract$
declare
    v_offer commerce.offers%rowtype;
    v_product commerce.products%rowtype;
    v_variant commerce.product_variants%rowtype;
    v_seller commerce.sellers%rowtype;
    v_order commerce.orders%rowtype;
    v_line commerce.order_lines%rowtype;
    v_event commerce.order_events%rowtype;
    v_proposal_id bigint;
    v_result jsonb;
begin
    select * into strict v_offer from commerce.offers
    where slug = 'order-create-single';
    select * into strict v_product from commerce.products where id = v_offer.product_id;
    select * into strict v_variant from commerce.product_variants where id = v_offer.variant_id;
    select * into strict v_seller from commerce.sellers where id = v_offer.seller_id;
    select id into strict v_proposal_id from commerce.offer_price_proposals
    where offer_id = v_offer.id and status = 'accepted';

    v_result := commerce.create_order_from_offers(
        'order-create-single-buyer', 'order-create-single-key',
        jsonb_build_array(jsonb_build_object('offerId', v_offer.id, 'quantity', 2)),
        '{"city":"Paris","line1":null}'::jsonb,
        '{"city":"Lyon"}'::jsonb
    );
    select * into strict v_order from commerce.orders
    where buyer_cms_user_id = 'order-create-single-buyer';
    select * into strict v_line from commerce.order_lines where order_id = v_order.id;
    select * into strict v_event from commerce.order_events where order_id = v_order.id;

    if v_result is distinct from to_jsonb(v_order)
        || jsonb_build_object('idempotent_replay', false)
       or v_order.subtotal_amount <> 24690 or v_order.total_amount <> 24690
       or v_order.shipping_address <> '{"city":"Paris","line1":null}'::jsonb
       or v_order.billing_address <> '{"city":"Lyon"}'::jsonb
       or (select count(*) from commerce.checkout_groups
           where id = v_order.checkout_group_id) <> 1 then
        raise exception 'order creation: one-line order contract changed: %', v_result;
    end if;

    if to_jsonb(v_line) - 'id' - 'created_at' is distinct from jsonb_build_object(
        'order_id', v_order.id, 'seller_id', v_seller.id,
        'offer_id', v_offer.id, 'product_id', v_product.id,
        'variant_id', v_variant.id, 'accepted_proposal_id', v_proposal_id,
        'title', 'Single Offer', 'sku', 'ORDER-CREATE-SINGLE-SKU',
        'quantity', 2, 'inventory_reserved', 2,
        'availability_before', 'available', 'inventory_revision_before', 11,
        'unit_amount', 12345, 'total_amount', 24690,
        'product_snapshot', jsonb_build_object(
            'id', v_product.id, 'slug', v_product.slug, 'title', v_product.title
        ),
        'variant_snapshot', jsonb_build_object(
            'id', v_variant.id, 'sku', v_variant.sku, 'title', v_variant.title,
            'combinationKey', 'size=m&color=blue',
            'options', jsonb_build_array(
                jsonb_build_object('axisKey', 'size', 'axisLabel', 'Size',
                    'valueKey', 'm', 'valueLabel', 'Medium'),
                jsonb_build_object('axisKey', 'color', 'axisLabel', 'Color',
                    'valueKey', 'blue', 'valueLabel', 'Blue')
            )
        ),
        'offer_snapshot', jsonb_build_object(
            'id', v_offer.id, 'slug', v_offer.slug, 'title', v_offer.title,
            'conditionCode', 'very_good', 'acceptedPriceAmount', 12345,
            'currency', 'eur'
        ),
        'seller_snapshot', jsonb_build_object(
            'id', v_seller.id, 'kind', 'user', 'slug', v_seller.slug,
            'displayName', v_seller.display_name
        )
    ) then
        raise exception 'order creation: one-line snapshot changed: %', to_jsonb(v_line);
    end if;

    if to_jsonb(v_event) - 'id' - 'created_at' is distinct from jsonb_build_object(
        'order_id', v_order.id, 'event_type', 'order_created',
        'actor_kind', 'buyer', 'actor_id', 'order-create-single-buyer',
        'previous_status', null, 'next_status', 'awaiting_quote',
        'message', null, 'data', '{}'::jsonb
    ) or (select (quantity_available, availability, inventory_revision, version)
          from commerce.offers where id = v_offer.id)
          is distinct from row(5, 'available'::text, 11, 2) then
        raise exception 'order creation: one-line event or inventory changed';
    end if;
end;
$single_contract$;

do $hundred_lines$
declare
    v_items jsonb;
    v_expected_ids bigint[];
    v_expected_total bigint;
    v_result jsonb;
    v_order commerce.orders%rowtype;
begin
    select jsonb_agg(jsonb_build_object('offerId', id, 'quantity', 1) order by id desc),
           array_agg(id order by id desc), sum(accepted_price_amount)
    into v_items, v_expected_ids, v_expected_total
    from commerce.offers where slug like 'order-create-bulk-%';

    v_result := commerce.create_order_from_offers(
        'order-create-bulk-buyer', 'order-create-bulk-key', v_items
    );
    select * into strict v_order from commerce.orders
    where buyer_cms_user_id = 'order-create-bulk-buyer';

    if v_result is distinct from to_jsonb(v_order)
        || jsonb_build_object('idempotent_replay', false)
       or v_order.subtotal_amount <> v_expected_total
       or v_order.total_amount <> v_expected_total
       or (select count(*) from commerce.order_lines where order_id = v_order.id) <> 100
       or (select array_agg(offer_id order by id) from commerce.order_lines
           where order_id = v_order.id) is distinct from v_expected_ids
       or (select count(*) from commerce.order_events where order_id = v_order.id) <> 1
       or exists (
           select 1 from commerce.order_lines line
           join commerce.offers offer on offer.id = line.offer_id
           join commerce.products product on product.id = line.product_id
           join commerce.sellers seller on seller.id = line.seller_id
           where line.order_id = v_order.id and (
               line.quantity <> 1 or line.inventory_reserved <> 1
               or line.unit_amount <> offer.accepted_price_amount
               or line.total_amount <> offer.accepted_price_amount
               or line.product_snapshot <> jsonb_build_object(
                   'id', product.id, 'slug', product.slug, 'title', product.title)
               or line.variant_snapshot is not null
               or line.offer_snapshot <> jsonb_build_object(
                   'id', offer.id, 'slug', offer.slug, 'title', offer.title,
                   'conditionCode', offer.condition_code,
                   'acceptedPriceAmount', offer.accepted_price_amount,
                   'currency', offer.currency)
               or line.seller_snapshot <> jsonb_build_object(
                   'id', seller.id, 'kind', seller.kind, 'slug', seller.slug,
                   'displayName', seller.display_name)
           )
       ) or exists (
           select 1 from commerce.offers
           where slug like 'order-create-bulk-%'
             and (quantity_available <> 1 or availability <> 'available'
               or inventory_revision <> 100 + right(slug, 3)::integer
               or version <> 2)
       ) then
        raise exception 'order creation: 100-line contract changed: %', v_result;
    end if;
end;
$hundred_lines$;
