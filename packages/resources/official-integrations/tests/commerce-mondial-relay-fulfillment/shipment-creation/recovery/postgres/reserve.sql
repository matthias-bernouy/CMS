select pg_catalog.pg_advisory_lock(742001);
select dblink_connect(
    'creation_a',
    'dbname=' || current_database()
        || ' application_name=shipment_creation_reserve_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'creation_b',
    'dbname=' || current_database()
        || ' application_name=shipment_creation_reserve_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('creation_a', 'set role service_role');
select dblink_exec('creation_b', 'set role service_role');
select dblink_send_query(
    'creation_a',
    $$select commerce.reserve_order_shipment_creation(
        '00000000-0000-4000-8000-000000000042',
        'order-read-seller-17', 'seller-request:order-read-seller-17'
    ) as result$$
);
select shipment_creation_concurrency_test.wait_until_blocked(
    'shipment_creation_reserve_a'
);
select dblink_send_query(
    'creation_b',
    $$select commerce.reserve_order_shipment_creation(
        '00000000-0000-4000-8000-000000000042',
        'order-read-seller-17', 'seller-request:order-read-seller-17'
    ) as result$$
);
select shipment_creation_concurrency_test.wait_until_blocked(
    'shipment_creation_reserve_b'
);
select pg_catalog.pg_advisory_unlock(742001);

create temporary table reserve_results (result jsonb);
insert into reserve_results
select result from dblink_get_result('creation_a') as response(result jsonb);
insert into reserve_results
select result from dblink_get_result('creation_b') as response(result jsonb);

do $reserve$
declare
    v_result_count bigint;
    v_operation_value_count bigint;
    v_token_value_count bigint;
    v_operation_distinct_count bigint;
    v_token_distinct_count bigint;
    v_matching_count bigint;
    v_mutation_count bigint;
    v_operation_id bigint;
    v_claim_token text;
    v_claimed_by text;
    v_operation_status text;
    v_attempts integer;
    v_fulfillment_version integer;
begin
    select operation.id, operation.claim_token::text, operation.claimed_by,
        operation.status, operation.attempts
    into v_operation_id, v_claim_token, v_claimed_by,
        v_operation_status, v_attempts
    from commerce.shipment_creation_operations operation
    join commerce.orders order_row on order_row.id = operation.order_id
    where order_row.order_number = 'ORDER-READ-42';
    select pg_catalog.count(*),
        pg_catalog.count(result->>'operationId'),
        pg_catalog.count(result->>'claimToken'),
        pg_catalog.count(distinct result->>'operationId'),
        pg_catalog.count(distinct result->>'claimToken'),
        pg_catalog.count(*) filter (
            where (result->>'operationId')::bigint = v_operation_id
              and result->>'claimToken' = v_claim_token
        )
    into v_result_count, v_operation_value_count, v_token_value_count,
        v_operation_distinct_count, v_token_distinct_count, v_matching_count
    from reserve_results;
    select pg_catalog.count(*) into v_mutation_count
    from shipment_creation_concurrency_test.mutations where kind = 'reserve';
    select fulfillment.version into v_fulfillment_version
    from commerce.order_fulfillments fulfillment
    join commerce.orders order_row on order_row.id = fulfillment.order_id
    where order_row.order_number = 'ORDER-READ-42';
    if v_result_count is distinct from 2
       or v_operation_value_count is distinct from 2
       or v_token_value_count is distinct from 2
       or v_operation_distinct_count is distinct from 1
       or v_token_distinct_count is distinct from 1
       or v_matching_count is distinct from 2
       or v_mutation_count is distinct from 1
       or v_claimed_by is distinct from 'seller-request:order-read-seller-17'
       or v_operation_status is distinct from 'processing'
       or v_attempts is distinct from 1
       or v_fulfillment_version is distinct from 5 then
        raise exception 'shipment creation: concurrent reserve diverged: %',
            pg_catalog.jsonb_build_object(
                'results', v_result_count,
                'operationValues', v_operation_value_count,
                'tokenValues', v_token_value_count,
                'operationVariants', v_operation_distinct_count,
                'tokenVariants', v_token_distinct_count,
                'persistedMatches', v_matching_count,
                'mutations', v_mutation_count,
                'claimedBy', v_claimed_by,
                'status', v_operation_status,
                'attempts', v_attempts,
                'fulfillmentVersion', v_fulfillment_version
            );
    end if;
end;
$reserve$;

select (result->>'operationId')::bigint as operation_id,
    result->>'claimToken' as claim_token
from reserve_results limit 1 \gset
select dblink_disconnect('creation_a');
select dblink_disconnect('creation_b');
drop table reserve_results;
