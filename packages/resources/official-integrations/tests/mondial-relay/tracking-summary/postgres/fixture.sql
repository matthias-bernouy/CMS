drop schema if exists delivery_tracking_summary_test cascade;
create schema delivery_tracking_summary_test;
create extension if not exists dblink;

create function delivery_tracking_summary_test.cleanup()
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
    delete from delivery.shipments
    where id like 'tracking-summary-pg-%'
$$;

create function delivery_tracking_summary_test.hold_event_table_lock(
    p_advisory_key bigint
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
    lock table delivery.shipment_events in access exclusive mode;
    perform pg_catalog.pg_advisory_lock(p_advisory_key);
    perform pg_catalog.pg_advisory_unlock(p_advisory_key);
    return true;
end;
$$;

create function delivery_tracking_summary_test.wait_for_lock(
    p_application_name text,
    p_lock_type text,
    p_granted boolean
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '5 seconds';
begin
    loop
        exit when exists (
            select 1
            from pg_catalog.pg_locks lock_row
            join pg_catalog.pg_stat_activity activity on activity.pid = lock_row.pid
            where activity.application_name = p_application_name
              and lock_row.locktype = p_lock_type
              and lock_row.granted = p_granted
        );
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'tracking summary: lock was not observed for %', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

create function delivery_tracking_summary_test.wait_for_result(p_connection text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_deadline timestamptz := pg_catalog.clock_timestamp() + interval '2 seconds';
begin
    while public.dblink_is_busy(p_connection) = 1 loop
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'tracking summary: unexpected second read on %', p_connection;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

revoke all on schema delivery_tracking_summary_test from public;
revoke all on all functions in schema delivery_tracking_summary_test from public;
grant usage on schema delivery_tracking_summary_test to service_role;

select delivery_tracking_summary_test.cleanup();
