select delivery_tracking_summary_test.cleanup();

insert into delivery.shipments (
    id, expedition_number, status, recipient_name,
    recipient_postal_code, recipient_city, weight_grams
) values (
    'tracking-summary-pg-freshness', '11435394', 'in_transit', 'Private Recipient',
    '76930', 'Octeville-sur-Mer', 500
);
insert into delivery.shipment_events (
    shipment_id, order_public_id, expedition_number, provider_event_key,
    normalized_status, occurred_at, event_label, created_at
) values (
    'tracking-summary-pg-freshness', 'order-freshness', '11435394', 'existing',
    'in_transit', '2026-07-21T11:00:00Z', 'En transit', '2026-07-21T11:01:00Z'
);

select public.dblink_connect(
    'tracking_writer',
    'dbname=' || current_database() || ' application_name=tracking_writer'
);
select public.dblink_connect(
    'tracking_blocker',
    'dbname=' || current_database() || ' application_name=tracking_blocker'
);
select public.dblink_connect(
    'tracking_reader',
    'dbname=' || current_database() || ' application_name=tracking_reader'
);
select public.dblink_exec('tracking_writer', 'set role service_role');
select public.dblink_exec('tracking_reader', 'set role service_role');
select public.dblink_exec('tracking_writer', 'begin');
select public.dblink_exec(
    'tracking_writer',
    $$insert into delivery.shipment_events (
          shipment_id, order_public_id, expedition_number, provider_event_key,
          normalized_status, occurred_at, event_label, created_at
      ) values (
          'tracking-summary-pg-freshness', 'order-freshness', '11435394', 'concurrent',
          'available_for_pickup', '2026-07-21T12:00:00Z',
          'Disponible au Point Relais', '2026-07-21T12:01:00Z'
      )$$
);

select pg_catalog.pg_advisory_lock(91435394);
select public.dblink_send_query(
    'tracking_blocker',
    'select delivery_tracking_summary_test.hold_event_table_lock(91435394)'
);
select delivery_tracking_summary_test.wait_for_lock(
    'tracking_blocker', 'relation', false
);
select public.dblink_send_query(
    'tracking_reader',
    $$select shipment, events
      from delivery.read_tracking_summary('11435394')$$
);
select delivery_tracking_summary_test.wait_for_lock(
    'tracking_reader', 'relation', false
);
select public.dblink_exec('tracking_writer', 'commit');
select delivery_tracking_summary_test.wait_for_lock(
    'tracking_blocker', 'advisory', false
);
select pg_catalog.pg_advisory_unlock(91435394);

create temporary table tracking_blocker_result as
select result.completed
from public.dblink_get_result('tracking_blocker') as result(completed boolean);
create temporary table tracking_reader_result as
select result.shipment, result.events
from public.dblink_get_result('tracking_reader')
    as result(shipment jsonb, events jsonb);

do $freshness$
declare
    v_events jsonb := (select events from tracking_reader_result);
begin
    if not (select completed from tracking_blocker_result)
       or v_events -> 0 ->> 'event_label' <> 'Disponible au Point Relais'
       or pg_catalog.jsonb_array_length(v_events) <> 2 then
        raise exception 'tracking summary: READ COMMITTED event freshness changed: %', v_events;
    end if;
end;
$freshness$;

select public.dblink_disconnect('tracking_reader');
select public.dblink_disconnect('tracking_blocker');
select public.dblink_disconnect('tracking_writer');
drop table tracking_reader_result;
drop table tracking_blocker_result;
select delivery_tracking_summary_test.cleanup();
