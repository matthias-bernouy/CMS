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
