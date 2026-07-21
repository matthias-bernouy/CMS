create extension if not exists dblink;
drop schema if exists commerce_order_creation_test cascade;
create schema commerce_order_creation_test;

create table commerce_order_creation_test.mutations (
    order_id bigint not null,
    offer_id bigint not null
);

create function commerce_order_creation_test.block_order_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1 from commerce.offers
        where id = new.offer_id and slug like 'order-create-concurrency-%'
    ) then
        insert into commerce_order_creation_test.mutations values (new.order_id, new.offer_id);
        perform pg_catalog.pg_advisory_xact_lock(743301);
    end if;
    return new;
end;
$$;

create trigger order_creation_concurrency_barrier
after insert on commerce.order_lines
for each row execute function commerce_order_creation_test.block_order_line();

create function commerce_order_creation_test.attempt(
    p_buyer text,
    p_key text,
    p_offer_slugs jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_items jsonb;
begin
    if current_user <> 'service_role' then
        raise exception 'order creation: concurrent attempt was not service_role';
    end if;
    select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('offerId', offer.id, 'quantity', p_quantity)
        order by requested.ordinality
    ) into v_items
    from pg_catalog.jsonb_array_elements_text(p_offer_slugs)
        with ordinality requested(slug, ordinality)
    join commerce.offers offer on offer.slug = requested.slug;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'result', commerce.create_order_from_offers(p_buyer, p_key, v_items)
    );
exception when others then
    return pg_catalog.jsonb_build_object('state', 'error', 'message', sqlerrm);
end;
$$;

create function commerce_order_creation_test.wait_until_blocked(
    p_application_name text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
begin
    loop
        if exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and not lock_row.granted
        ) then return; end if;
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'order creation: session % did not block', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create function commerce_order_creation_test.run_pair(
    p_buyer_a text, p_key_a text, p_slugs_a jsonb,
    p_buyer_b text, p_key_b text, p_slugs_b jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_a jsonb;
    v_b jsonb;
begin
    perform pg_catalog.pg_advisory_lock(743301);
    perform public.dblink_connect(
        'order_create_a', 'dbname=' || current_database()
            || ' application_name=order_creation_a options=-cstatement_timeout=10000'
    );
    perform public.dblink_connect(
        'order_create_b', 'dbname=' || current_database()
            || ' application_name=order_creation_b options=-cstatement_timeout=10000'
    );
    perform public.dblink_exec('order_create_a', 'set role service_role');
    perform public.dblink_exec('order_create_b', 'set role service_role');
    perform public.dblink_send_query('order_create_a', pg_catalog.format(
        'select commerce_order_creation_test.attempt(%L,%L,%L::jsonb,%s)',
        p_buyer_a, p_key_a, p_slugs_a::text, p_quantity
    ));
    perform commerce_order_creation_test.wait_until_blocked('order_creation_a');
    perform public.dblink_send_query('order_create_b', pg_catalog.format(
        'select commerce_order_creation_test.attempt(%L,%L,%L::jsonb,%s)',
        p_buyer_b, p_key_b, p_slugs_b::text, p_quantity
    ));
    perform commerce_order_creation_test.wait_until_blocked('order_creation_b');
    perform pg_catalog.pg_advisory_unlock(743301);
    select result into v_a from public.dblink_get_result('order_create_a') response(result jsonb);
    select result into v_b from public.dblink_get_result('order_create_b') response(result jsonb);
    perform public.dblink_disconnect('order_create_a');
    perform public.dblink_disconnect('order_create_b');
    return pg_catalog.jsonb_build_array(v_a, v_b);
exception when others then
    perform pg_catalog.pg_advisory_unlock(743301);
    raise;
end;
$$;

grant usage on schema commerce_order_creation_test to service_role;
grant execute on function commerce_order_creation_test.attempt(text, text, jsonb, integer)
to service_role;
