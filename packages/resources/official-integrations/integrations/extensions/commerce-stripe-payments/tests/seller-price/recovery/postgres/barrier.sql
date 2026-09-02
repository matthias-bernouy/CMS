create extension if not exists dblink;
create schema seller_price_submission_test;

create table seller_price_submission_test.state (
    offer_id bigint primary key,
    expected_version integer not null,
    baseline_event_count bigint not null
);

create table seller_price_submission_test.mutations (
    kind text not null
);

create function seller_price_submission_test.observe_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (
        select 1 from seller_price_submission_test.state
        where offer_id = new.offer_id
    ) then
        insert into seller_price_submission_test.mutations values ('proposal');
        perform pg_catalog.pg_advisory_xact_lock(743001);
    end if;
    return new;
end;
$$;

create trigger seller_price_submission_concurrency_probe
after insert on commerce.offer_price_proposals
for each row execute function
    seller_price_submission_test.observe_proposal();

create function seller_price_submission_test.attempt()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_state seller_price_submission_test.state%rowtype;
begin
    if current_user <> 'service_role' then
        raise exception 'seller price: attempt did not run as service_role';
    end if;
    select * into v_state from seller_price_submission_test.state limit 1;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'result', commerce.submit_offer_price(
            v_state.offer_id,
            'seller-price-concurrency-user',
            12000,
            v_state.expected_version
        )
    );
exception when others then
    return pg_catalog.jsonb_build_object(
        'state', 'error',
        'message', sqlerrm
    );
end;
$$;

create function seller_price_submission_test.wait_until_blocked(
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
            raise exception 'seller price: session % did not block',
                p_application_name;
        end if;
        perform pg_catalog.pg_sleep(0.01);
    end loop;
end;
$$;

grant usage on schema seller_price_submission_test to service_role;
grant select on seller_price_submission_test.state,
    seller_price_submission_test.mutations to service_role;
grant execute on function seller_price_submission_test.attempt()
to service_role;
