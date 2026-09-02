select pg_catalog.pg_advisory_lock(742002);
select dblink_connect(
    'creation_a',
    'dbname=' || current_database()
        || ' application_name=shipment_creation_complete_a'
        || ' options=-cstatement_timeout=10000'
);
select dblink_connect(
    'creation_b',
    'dbname=' || current_database()
        || ' application_name=shipment_creation_complete_b'
        || ' options=-cstatement_timeout=10000'
);
select dblink_exec('creation_a', 'set role service_role');
select dblink_exec('creation_b', 'set role service_role');
select dblink_send_query('creation_a', pg_catalog.format(
    'select commerce.complete_order_shipment_creation(%s, %L::uuid, %L, %L, %L::jsonb) as result',
    :'operation_id', :'claim_token', '12345678', 'shipment-42',
    '{"status":"label_ready"}'
));
select shipment_creation_concurrency_test.wait_until_blocked(
    'shipment_creation_complete_a'
);
select dblink_send_query('creation_b', pg_catalog.format(
    'select commerce.complete_order_shipment_creation(%s, %L::uuid, %L, %L, %L::jsonb) as result',
    :'operation_id', :'claim_token', '12345678', 'shipment-42',
    '{"status":"label_ready"}'
));
select shipment_creation_concurrency_test.wait_until_blocked(
    'shipment_creation_complete_b'
);
select pg_catalog.pg_advisory_unlock(742002);

create temporary table completion_results (result jsonb);
insert into completion_results
select result from dblink_get_result('creation_a') as response(result jsonb);
insert into completion_results
select result from dblink_get_result('creation_b') as response(result jsonb);

do $completion$
declare
    v_result_count bigint;
    v_fresh_count bigint;
    v_replay_count bigint;
    v_matching_count bigint;
    v_mutation_count bigint;
    v_event_count bigint;
    v_operation_id bigint;
    v_operation_status text;
    v_provider_reference text;
    v_provider_shipment_id text;
    v_fulfillment_version integer;
begin
    select operation.id, operation.status, operation.provider_reference,
        operation.provider_shipment_id
    into v_operation_id, v_operation_status, v_provider_reference,
        v_provider_shipment_id
    from commerce.shipment_creation_operations operation
    join commerce.orders order_row on order_row.id = operation.order_id
    where order_row.order_number = 'ORDER-READ-42';
    select pg_catalog.count(*), pg_catalog.count(*) filter (
            where result->'fulfillment' is not null
              and (result->>'idempotentReplay')::boolean is false
        ), pg_catalog.count(*) filter (
            where not (result ? 'fulfillment')
              and (result->>'idempotentReplay')::boolean is true
        ), pg_catalog.count(*) filter (
            where (result->>'id')::bigint = v_operation_id
              and result->>'status' = v_operation_status
              and result->>'provider_reference' = v_provider_reference
              and result->>'provider_shipment_id' = v_provider_shipment_id
        )
    into v_result_count, v_fresh_count, v_replay_count, v_matching_count
    from completion_results;
    select pg_catalog.count(*) into v_mutation_count
    from shipment_creation_concurrency_test.mutations where kind = 'complete';
    select pg_catalog.count(*) into v_event_count
    from commerce.audit_events event
    join commerce.orders order_row on order_row.id = event.order_id
    where order_row.order_number = 'ORDER-READ-42'
      and event.event_type = 'shipment_creation_succeeded';
    select fulfillment.version into v_fulfillment_version
    from commerce.order_fulfillments fulfillment
    join commerce.orders order_row on order_row.id = fulfillment.order_id
    where order_row.order_number = 'ORDER-READ-42';
    if v_result_count is distinct from 2
       or v_fresh_count is distinct from 1
       or v_replay_count is distinct from 1
       or v_matching_count is distinct from 2
       or v_mutation_count is distinct from 1
       or v_event_count is distinct from 1
       or v_operation_status is distinct from 'succeeded'
       or v_provider_reference is distinct from '12345678'
       or v_provider_shipment_id is distinct from 'shipment-42'
       or v_fulfillment_version is distinct from 6 then
        raise exception 'shipment creation: concurrent completion diverged: %',
            pg_catalog.jsonb_build_object(
                'results', v_result_count,
                'fresh', v_fresh_count,
                'replays', v_replay_count,
                'persistedMatches', v_matching_count,
                'mutations', v_mutation_count,
                'events', v_event_count,
                'status', v_operation_status,
                'providerReference', v_provider_reference,
                'providerShipmentId', v_provider_shipment_id,
                'fulfillmentVersion', v_fulfillment_version
            );
    end if;
end;
$completion$;

select dblink_disconnect('creation_a');
select dblink_disconnect('creation_b');
drop table completion_results;
