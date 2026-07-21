begin;
set local role service_role;
\ir fixture.sql
commit;

\ir barrier.sql

do $last_stock$
declare
    v_offer_id bigint := (select id from commerce.offers where slug = 'order-create-concurrency-stock');
    v_results jsonb;
begin
    delete from commerce_order_creation_test.mutations;
    v_results := commerce_order_creation_test.run_pair(
        'order-create-race-a', 'order-create-race-a-key', '["order-create-concurrency-stock"]',
        'order-create-race-b', 'order-create-race-b-key', '["order-create-concurrency-stock"]', 1
    );
    if (select count(*) from jsonb_array_elements(v_results) result
        where result->>'state' = 'ok'
          and result->'result'->>'idempotent_replay' = 'false') <> 1
       or (select count(*) from jsonb_array_elements(v_results) result
           where result = jsonb_build_object(
               'state', 'error',
               'message', format('conflict: offer %s is not sellable', v_offer_id)
           )) <> 1
       or (select (quantity_available, availability, inventory_revision, version)
           from commerce.offers where id = v_offer_id)
          is distinct from row(0, 'unavailable'::text, 29, 2)
       or (select count(*) from commerce.orders
           where buyer_cms_user_id in ('order-create-race-a', 'order-create-race-b')) <> 1
       or (select count(*) from commerce_order_creation_test.mutations) <> 1 then
        raise exception 'order creation: last-stock concurrency changed: %', v_results;
    end if;
end;
$last_stock$;

do $opposite_order$
declare
    v_low_id bigint := (select id from commerce.offers where slug = 'order-create-concurrency-low');
    v_results jsonb;
begin
    delete from commerce_order_creation_test.mutations;
    v_results := commerce_order_creation_test.run_pair(
        'order-create-lock-a', 'order-create-lock-a-key',
        '["order-create-concurrency-high","order-create-concurrency-low"]',
        'order-create-lock-b', 'order-create-lock-b-key',
        '["order-create-concurrency-low","order-create-concurrency-high"]', 2
    );
    if (select count(*) from jsonb_array_elements(v_results) result
        where result->>'state' = 'ok') <> 1
       or (select count(*) from jsonb_array_elements(v_results) result
           where result = jsonb_build_object(
               'state', 'error',
               'message', format('conflict: insufficient quantity for offer %s', v_low_id)
           )) <> 1
       or exists (
           select 1 from commerce.offers
           where slug in ('order-create-concurrency-low', 'order-create-concurrency-high')
             and (quantity_available <> 1 or availability <> 'available'
               or inventory_revision not in (30, 31) or version <> 2)
       ) or (select count(*) from commerce.orders
           where buyer_cms_user_id in ('order-create-lock-a', 'order-create-lock-b')) <> 1
       or (select count(*) from commerce_order_creation_test.mutations) <> 2 then
        raise exception 'order creation: opposite-order locking changed: %', v_results;
    end if;
end;
$opposite_order$;

do $concurrent_replay$
declare
    v_offer_id bigint := (select id from commerce.offers where slug = 'order-create-concurrency-idem');
    v_results jsonb;
begin
    delete from commerce_order_creation_test.mutations;
    v_results := commerce_order_creation_test.run_pair(
        'order-create-concurrent-replay', 'order-create-concurrent-replay-key',
        '["order-create-concurrency-idem"]',
        'order-create-concurrent-replay', 'order-create-concurrent-replay-key',
        '["order-create-concurrency-idem"]', 1
    );
    if (select count(*) from jsonb_array_elements(v_results) result
        where result->>'state' = 'ok'
          and result->'result'->>'idempotent_replay' = 'false') <> 1
       or (select count(*) from jsonb_array_elements(v_results) result
           where result->>'state' = 'ok'
             and result->'result'->>'idempotent_replay' = 'true') <> 1
       or (select count(*) from commerce.orders
           where buyer_cms_user_id = 'order-create-concurrent-replay') <> 1
       or (select count(*) from commerce.order_lines line
           join commerce.orders order_row on order_row.id = line.order_id
           where order_row.buyer_cms_user_id = 'order-create-concurrent-replay') <> 1
       or (select count(*) from commerce.order_events event
           join commerce.orders order_row on order_row.id = event.order_id
           where order_row.buyer_cms_user_id = 'order-create-concurrent-replay') <> 1
       or (select (quantity_available, availability, inventory_revision, version)
           from commerce.offers where id = v_offer_id)
          is distinct from row(1, 'available'::text, 32, 2)
       or (select count(*) from commerce_order_creation_test.mutations) <> 1 then
        raise exception 'order creation: concurrent replay changed: %', v_results;
    end if;
end;
$concurrent_replay$;
