\set ON_ERROR_STOP on
create extension if not exists dblink;
drop schema if exists commerce_checkout_test cascade;
create schema commerce_checkout_test;
create table commerce_checkout_test.mutations (order_id bigint not null);
create function commerce_checkout_test.block_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from commerce.offers
        where id = new.offer_id and slug = 'checkout-concurrency-offer') then
        insert into commerce_checkout_test.mutations values (new.order_id);
        perform pg_catalog.pg_advisory_xact_lock(743302);
    end if;
    return new;
end;
$$;
create trigger checkout_concurrency_barrier
after insert on commerce.order_lines
for each row execute function commerce_checkout_test.block_order_line();
create function commerce_checkout_test.attempt()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if current_user <> 'service_role' then
        raise exception 'checkout concurrency: attempt was not service_role';
    end if;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'result', commerce.checkout_cart(
            'checkout-concurrency-buyer', 'checkout-concurrency-key', 1,
            '{"city":"Paris"}'::jsonb, '{}'::jsonb, '{}'::jsonb
        )
    );
exception when others then
    return pg_catalog.jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;
create function commerce_checkout_test.wait_until_blocked(p_application_name text)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
begin
    loop
        if exists (
            select 1 from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_application_name and not lock_row.granted
        ) then return; end if;
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'checkout concurrency: session % did not block', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;
grant usage on schema commerce_checkout_test to service_role;
grant execute on function commerce_checkout_test.attempt() to service_role;
begin;
set local role service_role;
do $fixture$
declare
    v_product_id bigint;
    v_seller_id bigint;
    v_offer_id bigint;
    v_cart_id bigint;
begin
    insert into commerce.products (slug, title, status, visibility)
    values ('checkout-concurrency-product', 'Checkout concurrency product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values (
        'user', 'checkout-concurrency-seller', 'checkout-concurrency-seller',
        'Checkout concurrency seller', 'verified', now(), 'checkout-test'
    ) returning id into v_seller_id;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_id, v_product_id, 'checkout-concurrency-offer',
        'Checkout concurrency offer', 'good', 'active', 'approved',
        2500, 'eur', 'available', 2
    ) returning id into v_offer_id;
    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-concurrency-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values (v_cart_id, v_offer_id, 1, 2500, 1);
end;
$fixture$;
commit;
select pg_advisory_lock(743302);
select dblink_connect(
    'checkout_a', 'dbname=' || current_database()
        || ' application_name=checkout_concurrency_a options=-cstatement_timeout=10000'
);
select dblink_connect(
    'checkout_b', 'dbname=' || current_database()
        || ' application_name=checkout_concurrency_b options=-cstatement_timeout=10000'
);
select dblink_exec('checkout_a', 'set role service_role');
select dblink_exec('checkout_b', 'set role service_role');
select dblink_send_query('checkout_a', 'select commerce_checkout_test.attempt()');
select commerce_checkout_test.wait_until_blocked('checkout_concurrency_a');
select dblink_send_query('checkout_b', 'select commerce_checkout_test.attempt()');
select commerce_checkout_test.wait_until_blocked('checkout_concurrency_b');
select pg_advisory_unlock(743302);
create temporary table checkout_results (result jsonb not null);
insert into checkout_results
select result from dblink_get_result('checkout_a') response(result jsonb);
insert into checkout_results
select result from dblink_get_result('checkout_b') response(result jsonb);
do $assertions$
declare
    v_group_id uuid := (select id from commerce.checkout_groups
        where buyer_cms_user_id = 'checkout-concurrency-buyer');
begin
    if (select count(*) from checkout_results where result->>'state' = 'ok') <> 2
       or (select count(*) from checkout_results
           where result->'result'->>'idempotent_replay' = 'false') <> 1
       or (select count(*) from checkout_results
           where result->'result'->>'idempotent_replay' = 'true') <> 1
       or (select count(distinct (result->'result') - 'idempotent_replay'::text)
           from checkout_results) <> 1
       or (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce.order_lines line
           join commerce.orders order_row on order_row.id = line.order_id
           where order_row.checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce.order_events event
           join commerce.orders order_row on order_row.id = event.order_id
           where order_row.checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce_checkout_test.mutations) <> 1
       or (select (quantity_available, version) from commerce.offers
           where slug = 'checkout-concurrency-offer') is distinct from row(1, 2)
       or (select (status, version) from commerce.carts
           where buyer_cms_user_id = 'checkout-concurrency-buyer')
          is distinct from row('converted'::text, 2) then
        raise exception 'checkout concurrency: replay or mutation contract changed: %',
            (select jsonb_agg(result) from checkout_results);
    end if;
end;
$assertions$;

select dblink_disconnect('checkout_a');
select dblink_disconnect('checkout_b');
drop trigger checkout_concurrency_barrier on commerce.order_lines;
drop schema commerce_checkout_test cascade;

begin;
delete from commerce.order_events where order_id in (
    select id from commerce.orders where buyer_cms_user_id = 'checkout-concurrency-buyer'
);
delete from commerce.order_lines where order_id in (
    select id from commerce.orders where buyer_cms_user_id = 'checkout-concurrency-buyer'
);
delete from commerce.orders where buyer_cms_user_id = 'checkout-concurrency-buyer';
delete from commerce.checkout_groups where buyer_cms_user_id = 'checkout-concurrency-buyer';
delete from commerce.cart_items where cart_id in (
    select id from commerce.carts where buyer_cms_user_id = 'checkout-concurrency-buyer'
);
delete from commerce.carts where buyer_cms_user_id = 'checkout-concurrency-buyer';
delete from commerce.offers where slug = 'checkout-concurrency-offer';
delete from commerce.products where slug = 'checkout-concurrency-product';
delete from commerce.sellers where slug = 'checkout-concurrency-seller';
commit;
