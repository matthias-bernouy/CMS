do $inventory$
declare
    v_partial bigint := (select id from commerce.offers where slug = 'order-create-partial');
    v_exact bigint := (select id from commerce.offers where slug = 'order-create-exact');
    v_unlimited bigint := (select id from commerce.offers where slug = 'order-create-unlimited');
    v_order_id bigint;
begin
    perform commerce.create_order_from_offers(
        'order-create-partial-buyer', 'order-create-partial-key',
        jsonb_build_array(jsonb_build_object('offerId', v_partial, 'quantity', 2))
    );
    select id into strict v_order_id from commerce.orders
    where buyer_cms_user_id = 'order-create-partial-buyer';
    if (select (quantity_available, availability, inventory_revision, version)
        from commerce.offers where id = v_partial)
       is distinct from row(3, 'available'::text, 21, 2)
       or (select (inventory_reserved, availability_before, inventory_revision_before)
           from commerce.order_lines where order_id = v_order_id)
          is distinct from row(2, 'available'::text, 21) then
        raise exception 'order creation: partial inventory semantics changed';
    end if;

    perform commerce.create_order_from_offers(
        'order-create-exact-buyer', 'order-create-exact-key',
        jsonb_build_array(jsonb_build_object('offerId', v_exact, 'quantity', 2))
    );
    select id into strict v_order_id from commerce.orders
    where buyer_cms_user_id = 'order-create-exact-buyer';
    if (select (quantity_available, availability, inventory_revision, version)
        from commerce.offers where id = v_exact)
       is distinct from row(0, 'unavailable'::text, 22, 2)
       or (select (inventory_reserved, availability_before, inventory_revision_before)
           from commerce.order_lines where order_id = v_order_id)
          is distinct from row(2, 'available'::text, 22) then
        raise exception 'order creation: exact inventory semantics changed';
    end if;

    perform commerce.create_order_from_offers(
        'order-create-unlimited-buyer', 'order-create-unlimited-key',
        jsonb_build_array(jsonb_build_object('offerId', v_unlimited, 'quantity', 1000))
    );
    select id into strict v_order_id from commerce.orders
    where buyer_cms_user_id = 'order-create-unlimited-buyer';
    if (select (quantity_available, availability, inventory_revision, version)
        from commerce.offers where id = v_unlimited)
       is distinct from row(null::integer, 'preorder'::text, 23, 1)
       or (select (inventory_reserved, availability_before, inventory_revision_before)
           from commerce.order_lines where order_id = v_order_id)
          is distinct from row(0, null::text, null::integer) then
        raise exception 'order creation: unlimited inventory semantics changed';
    end if;
end;
$inventory$;

do $idempotence$
declare
    v_a bigint := (select id from commerce.offers where slug = 'order-create-idempotency-a');
    v_b bigint := (select id from commerce.offers where slug = 'order-create-idempotency-b');
    v_items jsonb := jsonb_build_array(
        jsonb_build_object('offerId', v_a, 'quantity', 1),
        jsonb_build_object('offerId', v_b, 'quantity', 1)
    );
    v_reversed jsonb := jsonb_build_array(
        jsonb_build_object('offerId', v_b, 'quantity', 1),
        jsonb_build_object('offerId', v_a, 'quantity', 1)
    );
    v_first jsonb;
    v_replay jsonb;
    v_order commerce.orders%rowtype;
begin
    v_first := commerce.create_order_from_offers(
        'order-create-idempotency-buyer', 'order-create-shared-key', v_items,
        '{"city":"Paris"}'::jsonb, '{"city":"Lyon"}'::jsonb
    );
    select * into strict v_order from commerce.orders
    where buyer_cms_user_id = 'order-create-idempotency-buyer';
    v_replay := commerce.create_order_from_offers(
        'order-create-idempotency-buyer', 'order-create-shared-key', v_reversed,
        '{"city":"Paris"}'::jsonb, '{"city":"Lyon"}'::jsonb
    );
    if v_first is distinct from to_jsonb(v_order)
        || jsonb_build_object('idempotent_replay', false)
       or v_replay is distinct from to_jsonb(v_order)
        || jsonb_build_object('idempotent_replay', true)
       or (select array_agg(offer_id order by id) from commerce.order_lines
           where order_id = v_order.id) is distinct from array[v_a, v_b]
       or (select count(*) from commerce.order_events where order_id = v_order.id) <> 1 then
        raise exception 'order creation: reordered replay contract changed';
    end if;

    perform pg_temp.expect_order_creation_error(
        'order-create-idempotency-buyer', 'order-create-shared-key',
        jsonb_build_array(
            jsonb_build_object('offerId', v_a, 'quantity', 2),
            jsonb_build_object('offerId', v_b, 'quantity', 1)
        ), 'conflict: idempotency key was already used for a different order'
    );
    begin
        perform commerce.create_order_from_offers(
            'order-create-idempotency-buyer', 'order-create-shared-key', v_items,
            '{"city":"Nice"}'::jsonb, '{"city":"Lyon"}'::jsonb
        );
        raise exception 'test: changed address unexpectedly replayed';
    exception when others then
        if sqlerrm = 'test: changed address unexpectedly replayed'
           or sqlerrm <> 'conflict: idempotency key was already used for a different order' then
            raise;
        end if;
    end;

    perform commerce.create_order_from_offers(
        'order-create-idempotency-other-buyer', 'order-create-shared-key', v_items,
        '{"city":"Paris"}'::jsonb, '{"city":"Lyon"}'::jsonb
    );
    v_replay := commerce.create_order_from_offers(
        'order-create-idempotency-buyer', 'order-create-shared-key', v_items,
        '{"city":"Paris"}'::jsonb, '{"city":"Lyon"}'::jsonb
    );
    if v_replay is distinct from to_jsonb(v_order)
        || jsonb_build_object('idempotent_replay', true)
       or (select count(*) from commerce.orders
           where idempotency_key = 'order-create-shared-key') <> 2
       or exists (
           select 1 from commerce.offers where id in (v_a, v_b)
             and (quantity_available <> 0 or availability <> 'unavailable'
               or inventory_revision not in (27, 28) or version <> 3)
       ) then
        raise exception 'order creation: buyer-scoped replay or inventory changed';
    end if;
end;
$idempotence$;
