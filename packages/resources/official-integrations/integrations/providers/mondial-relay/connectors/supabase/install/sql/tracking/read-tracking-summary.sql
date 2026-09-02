

create or replace function delivery.read_tracking_summary(
    p_expedition_number text
)
returns table (
    shipment jsonb,
    events jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_shipment_id text;
    v_shipment jsonb;
    v_events jsonb;
begin
    -- VOLATILE and the two statements deliberately retain the separate
    -- READ COMMITTED observation points of the former PostgREST requests.
    select
        shipment_row.id,
        pg_catalog.jsonb_build_object(
            'id', shipment_row.id,
            'status', shipment_row.status,
            'latest_event_label', shipment_row.latest_event_label,
            'latest_event_at', shipment_row.latest_event_at
        )
    into v_shipment_id, v_shipment
    from delivery.shipments shipment_row
    where shipment_row.expedition_number = p_expedition_number;

    if not found then
        return query select null::jsonb, '[]'::jsonb;
        return;
    end if;

    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'normalized_status', event_row.normalized_status,
                'occurred_at', event_row.occurred_at,
                'event_label', event_row.event_label,
                'event_date', event_row.event_date,
                'event_time', event_row.event_time,
                'location', event_row.location
            ) order by event_row.occurred_at desc nulls last, event_row.created_at desc
        ),
        '[]'::jsonb
    )
    into v_events
    from delivery.shipment_events event_row
    where event_row.shipment_id = v_shipment_id;

    return query select v_shipment, v_events;
end;
$$;

revoke execute on function delivery.read_tracking_summary(text)
    from public, anon, authenticated;
grant execute on function delivery.read_tracking_summary(text)
    to service_role;