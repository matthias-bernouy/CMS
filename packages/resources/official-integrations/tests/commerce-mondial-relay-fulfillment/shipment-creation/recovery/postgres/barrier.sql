create extension if not exists dblink;
drop schema if exists shipment_creation_concurrency_test cascade;
create schema shipment_creation_concurrency_test;

create table shipment_creation_concurrency_test.mutations (
    kind text not null
);

create function shipment_creation_concurrency_test.wait_until_blocked(
    p_application_name text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp()
        + interval '5 seconds';
begin
    loop
        if exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity
                on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and not lock_row.granted
        ) then
            return;
        end if;
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'shipment creation: session % did not block',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create function shipment_creation_concurrency_test.observe_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        insert into shipment_creation_concurrency_test.mutations
        values ('reserve');
        perform pg_catalog.pg_advisory_xact_lock(742001);
    elsif old.status = 'processing' and new.status = 'succeeded' then
        insert into shipment_creation_concurrency_test.mutations
        values ('complete');
        perform pg_catalog.pg_advisory_xact_lock(742002);
    end if;
    return new;
end;
$$;
