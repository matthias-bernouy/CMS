select provider_reconciliation_test.cleanup();

do $fixture$
declare
    v_payment_id bigint;
begin
    v_payment_id := provider_reconciliation_test.seed_payment('concurrency');
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind,
        provider_object_id, causal_sequence, created_at
    )
    select
        v_payment_id,
        'provider-reconciliation-pg-concurrency-' || value,
        'payment',
        v_payment_id::text,
        value,
        '2026-07-21 08:00:00+00'::timestamptz + value * interval '1 minute'
    from pg_catalog.generate_series(1, 4) value;
    insert into provider_reconciliation_test.concurrency_scope (projection_id)
    select id
    from stripe_connect.commerce_projection_outbox
    where projection_key like 'provider-reconciliation-pg-concurrency-%';
end;
$fixture$;

select pg_catalog.pg_advisory_lock(743104);
select dblink_connect(
    'provider_reconciliation_a',
    'dbname=' || current_database()
        || ' application_name=provider_reconciliation_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'provider_reconciliation_b',
    'dbname=' || current_database()
        || ' application_name=provider_reconciliation_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('provider_reconciliation_a', 'set role service_role');
select dblink_exec('provider_reconciliation_b', 'set role service_role');
select dblink_send_query(
    'provider_reconciliation_a',
    $$select provider_reconciliation_test.claim_batch(
        'provider-reconciliation-concurrency-a', 2
    ) as result$$
);
select provider_reconciliation_test.wait_until_blocked('provider_reconciliation_a');
select dblink_send_query(
    'provider_reconciliation_b',
    $$select provider_reconciliation_test.claim_batch(
        'provider-reconciliation-concurrency-b', 2
    ) as result$$
);
select provider_reconciliation_test.wait_until_blocked('provider_reconciliation_b');
select pg_catalog.pg_advisory_unlock(743104);

create temporary table provider_reconciliation_results (
    owner text primary key,
    result jsonb not null
);
insert into provider_reconciliation_results
select 'provider-reconciliation-concurrency-a', result
from dblink_get_result('provider_reconciliation_a') as response(result jsonb);
insert into provider_reconciliation_results
select 'provider-reconciliation-concurrency-b', result
from dblink_get_result('provider_reconciliation_b') as response(result jsonb);

do $concurrency$
begin
    if exists (
        select 1
        from provider_reconciliation_results
        where pg_catalog.jsonb_array_length(result) <> 2
    ) or (
        select pg_catalog.count(distinct item->>'id')
        from provider_reconciliation_results result_row
        cross join lateral pg_catalog.jsonb_array_elements(result_row.result) item
    ) <> 4 or exists (
        select 1
        from provider_reconciliation_results result_row
        cross join lateral pg_catalog.jsonb_array_elements(result_row.result) item
        where item->>'claim_owner' <> result_row.owner
           or item->>'projection_status' <> 'leased'
           or (item->>'attempt_count')::integer <> 1
           or nullif(item->>'claim_token', '') is null
    ) or (
        select pg_catalog.count(*)
        from stripe_connect.commerce_projection_outbox
        where projection_key like 'provider-reconciliation-pg-concurrency-%'
          and projection_status = 'leased'
          and attempt_count = 1
          and claim_token is not null
    ) <> 4 then
        raise exception 'provider reconciliation: concurrent claims overlapped: %',
            (select pg_catalog.jsonb_object_agg(owner, result)
             from provider_reconciliation_results);
    end if;
end;
$concurrency$;

select dblink_disconnect('provider_reconciliation_a');
select dblink_disconnect('provider_reconciliation_b');
drop trigger provider_reconciliation_claim_barrier
on stripe_connect.commerce_projection_outbox;
drop table provider_reconciliation_results;
select provider_reconciliation_test.cleanup();
