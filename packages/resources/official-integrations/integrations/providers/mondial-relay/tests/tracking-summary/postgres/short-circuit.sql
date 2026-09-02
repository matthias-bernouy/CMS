select delivery_tracking_summary_test.cleanup();

select public.dblink_connect(
    'tracking_missing_blocker',
    'dbname=' || current_database() || ' application_name=tracking_missing_blocker'
);
select public.dblink_connect(
    'tracking_missing_reader',
    'dbname=' || current_database() || ' application_name=tracking_missing_reader'
);
select public.dblink_exec('tracking_missing_reader', 'set role service_role');

select pg_catalog.pg_advisory_lock(90435394);
select public.dblink_send_query(
    'tracking_missing_blocker',
    'select delivery_tracking_summary_test.hold_event_table_lock(90435394)'
);
select delivery_tracking_summary_test.wait_for_lock(
    'tracking_missing_blocker', 'advisory', false
);
select public.dblink_send_query(
    'tracking_missing_reader',
    $$select shipment, events
      from delivery.read_tracking_summary('87654321')$$
);
select delivery_tracking_summary_test.wait_for_result('tracking_missing_reader');

create temporary table tracking_missing_result as
select result.shipment, result.events
from public.dblink_get_result('tracking_missing_reader')
    as result(shipment jsonb, events jsonb);

do $short_circuit$
begin
    if (select shipment from tracking_missing_result) is not null
       or (select events from tracking_missing_result) <> '[]'::jsonb then
        raise exception 'tracking summary: missing shipment did not short-circuit';
    end if;
end;
$short_circuit$;

select pg_catalog.pg_advisory_unlock(90435394);
select result.completed
from public.dblink_get_result('tracking_missing_blocker') as result(completed boolean);
select public.dblink_disconnect('tracking_missing_reader');
select public.dblink_disconnect('tracking_missing_blocker');
drop table tracking_missing_result;
