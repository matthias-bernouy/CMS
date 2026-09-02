\set ON_ERROR_STOP on
create extension if not exists dblink;
drop schema if exists commerce_checkout_cart_race cascade;
create schema commerce_checkout_cart_race;
create table commerce_checkout_cart_race.mutations (order_id bigint not null);
create function commerce_checkout_cart_race.block_order_line()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if exists (select 1 from commerce.offers
        where id = new.offer_id and slug = 'checkout-cart-race-offer') then
        insert into commerce_checkout_cart_race.mutations values (new.order_id);
        perform pg_catalog.pg_advisory_xact_lock(743303);
    end if;
    return new;
end;
$$;
create trigger checkout_cart_race_barrier after insert on commerce.order_lines
for each row execute function commerce_checkout_cart_race.block_order_line();
create function commerce_checkout_cart_race.attempt(p_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
    return pg_catalog.jsonb_build_object(
        'state', 'ok', 'key', p_key,
        'result', commerce.checkout_cart(
            'checkout-cart-race-buyer', p_key, 1,
            '{"city":"Paris"}'::jsonb, '{}'::jsonb, '{}'::jsonb
        )
    );
exception when others then
    return pg_catalog.jsonb_build_object(
        'state', 'error', 'key', p_key, 'message', sqlerrm
    );
end;
$$;
create function commerce_checkout_cart_race.wait(p_name text)
returns void language plpgsql set search_path = '' as $$
begin
    for attempt in 1..500 loop
        if exists (select 1 from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_name and not lock_row.granted) then
            return;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
    raise exception 'checkout cart race: session % did not block', p_name;
end;
$$;
grant usage on schema commerce_checkout_cart_race to service_role;
grant execute on function commerce_checkout_cart_race.attempt(text) to service_role;
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
    values ('checkout-cart-race-product', 'Checkout cart race product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.sellers (
        kind, cms_user_id, slug, display_name,
        verification_status, verified_at, verified_by
    ) values (
        'user', 'checkout-cart-race-seller', 'checkout-cart-race-seller',
        'Checkout cart race seller', 'verified', now(), 'checkout-test'
    ) returning id into v_seller_id;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code,
        publication_status, workflow_state, accepted_price_amount,
        currency, availability, quantity_available
    ) values (
        v_seller_id, v_product_id, 'checkout-cart-race-offer',
        'Checkout cart race offer', 'good', 'active', 'approved',
        2500, 'eur', 'available', 2
    ) returning id into v_offer_id;
    insert into commerce.carts (buyer_cms_user_id, status, currency, version)
    values ('checkout-cart-race-buyer', 'open', 'eur', 1)
    returning id into v_cart_id;
    insert into commerce.cart_items (
        cart_id, offer_id, quantity, unit_amount_at_add, offer_version_at_add
    ) values (v_cart_id, v_offer_id, 1, 2500, 1);
end;
$fixture$;
commit;
select pg_advisory_lock(743303);
select dblink_connect('cart_a', 'dbname=' || current_database()
    || ' application_name=checkout_cart_race_a options=-cstatement_timeout=10000');
select dblink_connect('cart_b', 'dbname=' || current_database()
    || ' application_name=checkout_cart_race_b options=-cstatement_timeout=10000');
select dblink_exec('cart_a', 'set role service_role');
select dblink_exec('cart_b', 'set role service_role');
select dblink_send_query('cart_a',
    $$select commerce_checkout_cart_race.attempt('checkout-cart-key-a')$$);
select commerce_checkout_cart_race.wait('checkout_cart_race_a');
select dblink_send_query('cart_b',
    $$select commerce_checkout_cart_race.attempt('checkout-cart-key-b')$$);
select commerce_checkout_cart_race.wait('checkout_cart_race_b');
select pg_advisory_unlock(743303);
create temporary table checkout_cart_race_results (result jsonb not null);
insert into checkout_cart_race_results
select result from dblink_get_result('cart_a') response(result jsonb);
insert into checkout_cart_race_results
select result from dblink_get_result('cart_b') response(result jsonb);
do $assertions$
declare
    v_group_id uuid := (select id from commerce.checkout_groups
        where buyer_cms_user_id = 'checkout-cart-race-buyer');
begin
    if (select count(*) from checkout_cart_race_results
        where result->>'state' = 'ok'
          and result->'result'->>'idempotent_replay' = 'false') <> 1
       or (select count(*) from checkout_cart_race_results
           where result->>'state' = 'error'
             and result->>'message' = 'not_found: cart') <> 1
       or (select count(*) from commerce.checkout_groups
           where buyer_cms_user_id = 'checkout-cart-race-buyer') <> 1
       or (select count(*) from commerce.orders where checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce.order_lines line join commerce.orders order_row
           on order_row.id = line.order_id where order_row.checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce.order_events event join commerce.orders order_row
           on order_row.id = event.order_id where order_row.checkout_group_id = v_group_id) <> 1
       or (select count(*) from commerce_checkout_cart_race.mutations) <> 1
       or (select (quantity_available, version) from commerce.offers
           where slug = 'checkout-cart-race-offer') is distinct from row(1, 2)
       or (select (status, version) from commerce.carts
           where buyer_cms_user_id = 'checkout-cart-race-buyer')
          is distinct from row('converted'::text, 2) then
        raise exception 'checkout cart race: contract changed: %',
            (select jsonb_agg(result) from checkout_cart_race_results);
    end if;
end;
$assertions$;
select dblink_disconnect('cart_a');
select dblink_disconnect('cart_b');
drop trigger checkout_cart_race_barrier on commerce.order_lines;
drop schema commerce_checkout_cart_race cascade;
begin;
delete from commerce.order_events where order_id in (
    select id from commerce.orders where buyer_cms_user_id = 'checkout-cart-race-buyer');
delete from commerce.order_lines where order_id in (
    select id from commerce.orders where buyer_cms_user_id = 'checkout-cart-race-buyer');
delete from commerce.orders where buyer_cms_user_id = 'checkout-cart-race-buyer';
delete from commerce.checkout_groups where buyer_cms_user_id = 'checkout-cart-race-buyer';
delete from commerce.cart_items where cart_id in (
    select id from commerce.carts where buyer_cms_user_id = 'checkout-cart-race-buyer');
delete from commerce.carts where buyer_cms_user_id = 'checkout-cart-race-buyer';
delete from commerce.offers where slug = 'checkout-cart-race-offer';
delete from commerce.products where slug = 'checkout-cart-race-product';
delete from commerce.sellers where slug = 'checkout-cart-race-seller';
commit;
