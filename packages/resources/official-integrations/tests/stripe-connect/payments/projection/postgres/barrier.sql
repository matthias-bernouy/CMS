create extension if not exists dblink;

create table payment_projection_test.concurrency_state (
    payment_id bigint primary key,
    expected_payment jsonb not null,
    projection jsonb not null
);

create table payment_projection_test.mutations (
    payment_id bigint not null
);

create function payment_projection_test.block_first_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if pg_catalog.to_jsonb(old) is distinct from pg_catalog.to_jsonb(new)
       and exists (
           select 1 from payment_projection_test.concurrency_state state
           where state.payment_id = new.id
       ) then
        insert into payment_projection_test.mutations values (new.id);
        perform pg_catalog.pg_advisory_xact_lock(743102);
    end if;
    return new;
end;
$$;

create trigger payment_projection_concurrency_barrier
after update on stripe_connect.payments
for each row execute function payment_projection_test.block_first_mutation();

create function payment_projection_test.attempt()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_state payment_projection_test.concurrency_state%rowtype;
begin
    if current_user <> 'service_role' then
        raise exception
            'payment projection: concurrent attempt was not service_role';
    end if;
    select * into strict v_state
    from payment_projection_test.concurrency_state;
    return stripe_connect.apply_payment_provider_projection(
        v_state.payment_id,
        v_state.expected_payment,
        v_state.projection
    );
end;
$$;

create function payment_projection_test.wait_until_blocked(
    p_application_name text
)
returns void
language plpgsql
security invoker
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
            raise exception 'payment projection: session % did not block',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

revoke all on all tables in schema payment_projection_test from public;
revoke all on all functions in schema payment_projection_test from public;
grant select on payment_projection_test.concurrency_state,
    payment_projection_test.mutations to service_role;
grant execute on function payment_projection_test.attempt()
to service_role;
