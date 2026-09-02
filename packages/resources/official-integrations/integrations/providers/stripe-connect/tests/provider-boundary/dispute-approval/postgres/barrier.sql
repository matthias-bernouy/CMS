create extension if not exists dblink;

create table dispute_approval_test.concurrency_state (
    dispute_id bigint primary key
);

create function dispute_approval_test.block_first_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if new.first_actor_id = 'admin-first' then
        perform pg_catalog.pg_advisory_xact_lock(743107);
    end if;
    return new;
end;
$$;

create trigger dispute_approval_concurrency_barrier
before insert on stripe_connect.irreversible_dispute_action_approvals
for each row execute function dispute_approval_test.block_first_actor();

create function dispute_approval_test.concurrent_attempt(p_actor_id text)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select dispute_approval_test.attempt(
        'dispute-approval-pg-concurrency', state.dispute_id, p_actor_id
    )
    from dispute_approval_test.concurrency_state state
$$;

create function dispute_approval_test.wait_until_blocked(p_application_name text)
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
            raise exception 'dispute approval: session % did not block', p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

revoke all on all tables in schema dispute_approval_test from public;
revoke all on all functions in schema dispute_approval_test from public;
grant select on dispute_approval_test.concurrency_state to service_role;
grant execute on function dispute_approval_test.concurrent_attempt(text) to service_role;
