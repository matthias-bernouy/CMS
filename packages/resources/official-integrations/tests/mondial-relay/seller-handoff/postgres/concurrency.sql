create extension if not exists dblink;
create schema delivery_handoff_test;
create table delivery_handoff_test.mutations (
    id bigint generated always as identity primary key
);
create function delivery_handoff_test.observe_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if old.id = 'seller-handoff-concurrency'
       and old.seller_handoff_declared_at is null
       and new.seller_handoff_declared_at is not null then
        insert into delivery_handoff_test.mutations default values;
        perform pg_catalog.pg_sleep(0.3);
    end if;
    return new;
end;
$$;
create trigger seller_handoff_concurrency_probe
before update on delivery.shipments
for each row execute function delivery_handoff_test.observe_mutation();

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id, recipient_name, recipient_postal_code,
    recipient_city, weight_grams
) values (
    'seller-handoff-concurrency', 'order-handoff-concurrency',
    'order-handoff-concurrency', '87654321', 'label_ready',
    'seller-handoff-concurrency', 'Private Buyer', '75001', 'Paris', 500
);

select dblink_connect('handoff_a', 'dbname=' || current_database());
select dblink_connect('handoff_b', 'dbname=' || current_database());
select dblink_send_query(
    'handoff_a',
    $$select delivery.declare_seller_handoff(
        'order-handoff-concurrency', 'seller-handoff-concurrency'
    ) as result$$
);
select pg_catalog.pg_sleep(0.05);
select dblink_send_query(
    'handoff_b',
    $$select delivery.declare_seller_handoff(
        'order-handoff-concurrency', 'seller-handoff-concurrency'
    ) as result$$
);

create temporary table seller_handoff_results (result jsonb);
insert into seller_handoff_results
select result from dblink_get_result('handoff_a') as response(result jsonb);
insert into seller_handoff_results
select result from dblink_get_result('handoff_b') as response(result jsonb);

do $concurrency$
declare
    distinct_results bigint;
    mutation_count bigint;
    response_timestamp timestamptz;
    stored_timestamp timestamptz;
begin
    select count(distinct result::text),
        min((result->>'seller_handoff_declared_at')::timestamptz)
    into distinct_results, response_timestamp
    from seller_handoff_results;
    select count(*) into mutation_count
    from delivery_handoff_test.mutations;
    select seller_handoff_declared_at into stored_timestamp
    from delivery.shipments where id = 'seller-handoff-concurrency';
    if distinct_results <> 1 or mutation_count <> 1
       or response_timestamp is distinct from stored_timestamp then
        raise exception
            'seller handoff: concurrent calls diverged: %, %, %, %',
            distinct_results, mutation_count, response_timestamp,
            stored_timestamp;
    end if;
end;
$concurrency$;

select dblink_disconnect('handoff_a');
select dblink_disconnect('handoff_b');
drop trigger seller_handoff_concurrency_probe on delivery.shipments;
drop schema delivery_handoff_test cascade;
delete from delivery.shipments where id = 'seller-handoff-concurrency';
