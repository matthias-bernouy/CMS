do $fixture$
declare
    v_payment_id bigint;
begin
    v_payment_id := payment_projection_test.seed('concurrency');
    insert into payment_projection_test.concurrency_state (
        payment_id, expected_payment, projection
    ) values (
        v_payment_id,
        payment_projection_test.snapshot(v_payment_id),
        payment_projection_test.apply_projection(
            v_payment_id,
            'payment:' || v_payment_id
                || ':provider-sync:succeeded:ch_payment_projection_'
                || v_payment_id || ':'
                || pg_catalog.repeat('b', 64),
            '2026-07-21 08:06:00+00'
        )
    );
end;
$fixture$;

select pg_catalog.pg_advisory_lock(743102);
select dblink_connect(
    'payment_projection_a',
    'dbname=' || current_database()
        || ' application_name=payment_projection_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'payment_projection_b',
    'dbname=' || current_database()
        || ' application_name=payment_projection_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('payment_projection_a', 'set role service_role');
select dblink_exec('payment_projection_b', 'set role service_role');
select dblink_send_query(
    'payment_projection_a',
    'select payment_projection_test.attempt() as result'
);
select payment_projection_test.wait_until_blocked(
    'payment_projection_a'
);
select dblink_send_query(
    'payment_projection_b',
    'select payment_projection_test.attempt() as result'
);
select payment_projection_test.wait_until_blocked(
    'payment_projection_b'
);
select pg_catalog.pg_advisory_unlock(743102);

create temporary table payment_projection_results (result jsonb);
insert into payment_projection_results
select result
from dblink_get_result('payment_projection_a') as response(result jsonb);
insert into payment_projection_results
select result
from dblink_get_result('payment_projection_b') as response(result jsonb);

do $concurrency$
declare
    v_payment_id bigint;
    v_payment jsonb;
begin
    select payment_id into strict v_payment_id
    from payment_projection_test.concurrency_state;
    v_payment := payment_projection_test.snapshot(v_payment_id);
    if (select pg_catalog.count(*)
        from payment_projection_results) <> 2
       or (select pg_catalog.count(*)
           from payment_projection_results
           where result->>'applied' = 'true'
             and result->'payment'->>'payment_status' = 'succeeded'
             and (result->'payment'->>'last_provider_sync_at')::timestamptz
                = '2026-07-21 08:06:00+00'::timestamptz
             and (select pg_catalog.count(*)
                  from pg_catalog.jsonb_object_keys(result)) = 2) <> 2
       or (select pg_catalog.count(*)
           from payment_projection_test.mutations
           where payment_id = v_payment_id) <> 2
       or (select pg_catalog.count(*)
           from stripe_connect.commerce_projection_outbox
           where payment_id = v_payment_id
             and projection_key = 'payment:' || v_payment_id
                || ':provider-sync:succeeded:ch_payment_projection_'
                || v_payment_id || ':'
                || pg_catalog.repeat('b', 64)) <> 1
       or v_payment->>'payment_status' <> 'succeeded'
       or (v_payment->>'last_provider_sync_at')::timestamptz
            <> '2026-07-21 08:06:00+00'::timestamptz then
        raise exception 'payment projection: concurrency diverged: %',
            (select pg_catalog.jsonb_agg(result)
             from payment_projection_results);
    end if;
end;
$concurrency$;

select dblink_disconnect('payment_projection_a');
select dblink_disconnect('payment_projection_b');
drop trigger payment_projection_concurrency_barrier
on stripe_connect.payments;
drop table payment_projection_results;
select payment_projection_test.cleanup();
