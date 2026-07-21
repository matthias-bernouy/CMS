create extension if not exists dblink;

create table provider_reconciliation_test.concurrency_scope (
    projection_id bigint primary key
);

create function provider_reconciliation_test.block_claim()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if new.projection_status = 'leased'
       and new.claim_owner like 'provider-reconciliation-concurrency-%'
       and exists (
           select 1
           from provider_reconciliation_test.concurrency_scope scope
           where scope.projection_id = new.id
       ) then
        perform pg_catalog.pg_advisory_xact_lock(743104);
    end if;
    return new;
end;
$$;

create trigger provider_reconciliation_claim_barrier
after update on stripe_connect.commerce_projection_outbox
for each row execute function provider_reconciliation_test.block_claim();

create function provider_reconciliation_test.claim_batch(
    p_owner text,
    p_limit integer
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(claimed) order by claimed.id),
        '[]'::jsonb
    )
    from stripe_connect.claim_commerce_projection_outbox(p_owner, p_limit) claimed
$$;

create function provider_reconciliation_test.wait_until_blocked(
    p_application_name text
)
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
            raise exception 'provider reconciliation: session % did not block',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

revoke all on all tables in schema provider_reconciliation_test from public;
revoke all on all functions in schema provider_reconciliation_test from public;
grant select on provider_reconciliation_test.concurrency_scope to service_role;
grant execute on function provider_reconciliation_test.claim_batch(text, integer)
to service_role;
