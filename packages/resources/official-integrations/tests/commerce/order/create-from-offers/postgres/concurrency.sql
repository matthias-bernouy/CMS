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

delete from commerce_order_creation_test.mutations;
select dblink_connect(
    'order_lock_blocker', 'dbname=' || current_database()
        || ' application_name=order_creation_blocker options=-cstatement_timeout=10000'
);
select dblink_connect(
    'order_lock_a', 'dbname=' || current_database()
        || ' application_name=order_creation_lock_a options=-cstatement_timeout=10000'
);
select dblink_connect(
    'order_lock_b', 'dbname=' || current_database()
        || ' application_name=order_creation_lock_b options=-cstatement_timeout=10000'
);
select dblink_exec('order_lock_blocker', 'set role service_role');
select dblink_exec('order_lock_a', 'set role service_role');
select dblink_exec('order_lock_b', 'set role service_role');
select dblink_exec('order_lock_blocker', 'begin');
select dblink_exec(
    'order_lock_blocker',
    'do $block$ begin perform id from commerce.offers
     where slug = ''order-create-concurrency-low'' for update; end $block$;'
);
select dblink_send_query(
    'order_lock_a',
    $$select commerce_order_creation_test.attempt(
        'order-create-lock-a', 'order-create-lock-a-key',
        '["order-create-concurrency-low","order-create-concurrency-high"]', 2
    )$$
);
select commerce_order_creation_test.wait_until_blocked('order_creation_lock_a');
select dblink_send_query(
    'order_lock_b',
    $$select commerce_order_creation_test.attempt(
        'order-create-lock-b', 'order-create-lock-b-key',
        '["order-create-concurrency-high","order-create-concurrency-low"]', 2
    )$$
);
select commerce_order_creation_test.wait_until_blocked('order_creation_lock_b');
select dblink_exec('order_lock_blocker', 'commit');

create temporary table order_lock_results (result jsonb not null);
insert into order_lock_results
select result from dblink_get_result('order_lock_a') response(result jsonb);
insert into order_lock_results
select result from dblink_get_result('order_lock_b') response(result jsonb);

do $opposite_order$
declare
    v_high_id bigint := (select id from commerce.offers where slug = 'order-create-concurrency-high');
begin
    if (select count(*) from order_lock_results where result->>'state' = 'ok') <> 1
       or (select count(*) from order_lock_results where result = jsonb_build_object(
           'state', 'error',
           'message', format('conflict: insufficient quantity for offer %s', v_high_id)
       )) <> 1
       or exists (
           select 1 from commerce.offers
           where slug in ('order-create-concurrency-low', 'order-create-concurrency-high')
             and (quantity_available <> 1 or availability <> 'available'
               or inventory_revision not in (30, 31) or version <> 2)
       ) or (select count(*) from commerce_order_creation_test.mutations) <> 2 then
        raise exception 'order creation: deterministic lock order changed: %',
            (select jsonb_agg(result) from order_lock_results);
    end if;
end;
$opposite_order$;

select dblink_disconnect('order_lock_blocker');
select dblink_disconnect('order_lock_a');
select dblink_disconnect('order_lock_b');
drop table order_lock_results;

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
