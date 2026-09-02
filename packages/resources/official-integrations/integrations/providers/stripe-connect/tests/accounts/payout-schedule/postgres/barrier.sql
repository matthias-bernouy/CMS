create extension if not exists dblink;

create table payout_schedule_test.concurrency_state (
    cms_user_id text primary key
);

create function payout_schedule_test.block_first_claim()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if new.cms_user_id = 'payout-schedule-pg-concurrency'
       and new.payout_hold_claimed_by = 'owner-first' then
        perform pg_catalog.pg_advisory_xact_lock(743108);
    end if;
    return new;
end;
$$;

create trigger payout_schedule_claim_barrier
before update on stripe_connect.accounts
for each row execute function payout_schedule_test.block_first_claim();

create function payout_schedule_test.concurrent_attempt(p_owner text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select payout_schedule_test.attempt(state.cms_user_id, p_owner, false, true)
    from payout_schedule_test.concurrency_state state
$$;

create function payout_schedule_test.wait_until_blocked(p_application_name text)
returns void
language plpgsql
security invoker
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
        ) then
            return;
        end if;
        if pg_catalog.clock_timestamp() >= v_deadline then
            raise exception 'payout schedule: session % did not block', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

revoke all on all tables in schema payout_schedule_test from public;
revoke all on all functions in schema payout_schedule_test from public;
grant select on payout_schedule_test.concurrency_state to service_role;
grant execute on function payout_schedule_test.concurrent_attempt(text) to service_role;
