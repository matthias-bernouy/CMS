create function pg_temp.expect_order_creation_error(
    p_buyer text,
    p_key text,
    p_items jsonb,
    p_expected text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    begin
        perform commerce.create_order_from_offers(p_buyer, p_key, p_items);
        raise exception 'test: order creation unexpectedly succeeded';
    exception when others then
        if sqlerrm = 'test: order creation unexpectedly succeeded'
           or sqlerrm <> p_expected then
            raise;
        end if;
    end;
end;
$$;
do $boundaries$
declare
    v_error_a bigint := (select id from commerce.offers where slug = 'order-create-error-a');
    v_error_b bigint := (select id from commerce.offers where slug = 'order-create-error-b');
    v_partial bigint := (select id from commerce.offers where slug = 'order-create-partial');
    v_other_seller bigint := (select id from commerce.offers where slug = 'order-create-other-seller');
    v_usd bigint := (select id from commerce.offers where slug = 'order-create-usd');
    v_items jsonb;
begin
    if v_error_a >= v_error_b then
        raise exception 'order creation: error fixture does not oppose lock and input order';
    end if;
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-empty', '[]'::jsonb,
        'validation: order items must contain between 1 and 100 entries'
    );
    select jsonb_agg(jsonb_build_object('offerId', id, 'quantity', 1))
    into v_items from (
        select id from commerce.offers where slug like 'order-create-bulk-%'
        union all select id from commerce.offers where slug = 'order-create-single'
    ) offers;
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-101', v_items,
        'validation: order items must contain between 1 and 100 entries'
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-input-b-first',
        jsonb_build_array(
            jsonb_build_object('offerId', v_error_b, 'quantity', 2),
            jsonb_build_object('offerId', v_error_a, 'quantity', 1)
        ), format('conflict: insufficient quantity for offer %s', v_error_b)
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-input-a-first',
        jsonb_build_array(
            jsonb_build_object('offerId', v_error_a, 'quantity', 1),
            jsonb_build_object('offerId', v_error_b, 'quantity', 2)
        ), format('conflict: offer %s is not sellable', v_error_a)
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-missing-global',
        jsonb_build_array(
            jsonb_build_object('offerId', v_error_a, 'quantity', 1),
            jsonb_build_object('offerId', 9007199254740991, 'quantity', 1)
        ), 'not_found: offer'
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-rollback',
        jsonb_build_array(
            jsonb_build_object('offerId', v_partial, 'quantity', 2),
            jsonb_build_object('offerId', v_error_b, 'quantity', 2)
        ), format('conflict: insufficient quantity for offer %s', v_error_b)
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-multi-seller',
        jsonb_build_array(
            jsonb_build_object('offerId', v_partial, 'quantity', 1),
            jsonb_build_object('offerId', v_other_seller, 'quantity', 1)
        ), 'conflict: one order cannot contain multiple sellers'
    );
    perform pg_temp.expect_order_creation_error(
        'order-create-boundary-buyer', 'order-create-multi-currency',
        jsonb_build_array(
            jsonb_build_object('offerId', v_partial, 'quantity', 1),
            jsonb_build_object('offerId', v_usd, 'quantity', 1)
        ), 'conflict: one order cannot contain multiple currencies'
    );
    if (select count(*) from commerce.orders
        where buyer_cms_user_id = 'order-create-boundary-buyer') <> 0
       or (select (quantity_available, inventory_revision, version)
           from commerce.offers where id = v_partial)
          is distinct from row(5, 21, 1) then
        raise exception 'order creation: rejected input left partial mutations';
    end if;
end;
$boundaries$;
do $validation_precedence$
declare
    v_single commerce.offers%rowtype := (
        select offer from commerce.offers offer where slug = 'order-create-single'
    );
    v_partial bigint := (select id from commerce.offers where slug = 'order-create-partial');
    v_other bigint := (select id from commerce.offers where slug = 'order-create-other-seller');
    v_usd bigint := (select id from commerce.offers where slug = 'order-create-usd');
    v_total bigint := (select id from commerce.offers where slug = 'order-create-total');
    v_axis_id bigint;
    v_value_id bigint;
begin
    update commerce.products set status = 'archived' where id = v_single.product_id;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-product-error',
        jsonb_build_array(jsonb_build_object('offerId', v_single.id, 'quantity', 1)),
        format('conflict: product for offer %s is not sellable', v_single.id)
    );
    update commerce.products set status = 'active' where id = v_single.product_id;
    update commerce.offers set variant_id = null where id = v_single.id;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-missing-variant',
        jsonb_build_array(jsonb_build_object('offerId', v_single.id, 'quantity', 1)),
        'validation: a product variant is required when the product has variant axes'
    );
    update commerce.offers set variant_id = v_single.variant_id where id = v_single.id;
    update commerce.product_variants set status = 'archived' where id = v_single.variant_id;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-inactive-variant',
        jsonb_build_array(jsonb_build_object('offerId', v_single.id, 'quantity', 1)),
        'validation: an active product variant is required'
    );
    update commerce.product_variants set status = 'active' where id = v_single.variant_id;
    select selection.axis_id, selection.value_id into strict v_axis_id, v_value_id
    from commerce.product_variant_selections selection
    join commerce.product_variant_axes axis on axis.id = selection.axis_id
    where selection.variant_id = v_single.variant_id and axis.key = 'color';
    delete from commerce.product_variant_selections
    where variant_id = v_single.variant_id and axis_id = v_axis_id;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-incomplete-variant',
        jsonb_build_array(jsonb_build_object('offerId', v_single.id, 'quantity', 1)),
        'validation: the product variant does not select every variant axis'
    );
    insert into commerce.product_variant_selections
        (product_id, variant_id, axis_id, value_id)
    values (v_single.product_id, v_single.variant_id, v_axis_id, v_value_id);
    update commerce.offers set availability = 'unavailable' where id = v_other;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-local-before-seller',
        jsonb_build_array(
            jsonb_build_object('offerId', v_partial, 'quantity', 1),
            jsonb_build_object('offerId', v_other, 'quantity', 1)
        ), format('conflict: offer %s is not sellable', v_other)
    );
    update commerce.offers set availability = 'available' where id = v_other;
    update commerce.offers set quantity_available = 0 where id = v_usd;
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-local-before-currency',
        jsonb_build_array(
            jsonb_build_object('offerId', v_partial, 'quantity', 1),
            jsonb_build_object('offerId', v_usd, 'quantity', 1)
        ), format('conflict: insufficient quantity for offer %s', v_usd)
    );
    update commerce.offers set quantity_available = 5 where id = v_usd;
    update commerce.settings set mode = 'ecommerce' where id = 'default';
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-marketplace-disabled',
        jsonb_build_array(jsonb_build_object('offerId', v_partial, 'quantity', 1)),
        'conflict: marketplace offers are disabled'
    );
    update commerce.settings set mode = 'marketplace' where id = 'default';
    perform pg_temp.expect_order_creation_error(
        'order-create-validation-buyer', 'order-create-total-overflow',
        jsonb_build_array(jsonb_build_object('offerId', v_total, 'quantity', 2)),
        'validation: order total exceeds the supported maximum'
    );
end;
$validation_precedence$;
