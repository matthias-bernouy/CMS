select delivery_tracking_summary_test.cleanup();
begin;

insert into delivery.shipments (
    id, expedition_number, status, recipient_name,
    recipient_postal_code, recipient_city, weight_grams,
    latest_event_label, latest_event_at
) values (
    'tracking-summary-pg-contract', '00435394', 'in_transit', 'Private Recipient',
    '76930', 'Octeville-sur-Mer', 500, null, null
);

insert into delivery.shipment_events (
    shipment_id, order_public_id, expedition_number, provider_event_key,
    normalized_status, occurred_at, event_label, event_date,
    event_time, location, created_at
) values
    (
        'tracking-summary-pg-contract', 'order-contract', '00435394', 'unknown-date',
        'in_transit', null, 'Date inconnue', null,
        null, null, '2026-07-21T13:00:00Z'
    ),
    (
        'tracking-summary-pg-contract', 'order-contract', '00435394', 'accepted',
        'carrier_accepted', '2026-07-21T09:00:00Z', 'Pris en charge', '2026-07-21',
        '09:00', 'ROUEN', '2026-07-21T09:01:00Z'
    ),
    (
        'tracking-summary-pg-contract', 'order-contract', '00435394', 'transit',
        'in_transit', '2026-07-21T11:00:00Z', 'En transit', '2026-07-21',
        '11:00', 'PARIS', '2026-07-21T11:01:00Z'
    );

do $found_contract$
declare
    v_context record;
begin
    select * into strict v_context
    from delivery.read_tracking_summary('00435394');

    if v_context.shipment <> jsonb_build_object(
        'id', 'tracking-summary-pg-contract',
        'status', 'in_transit',
        'latest_event_label', null,
        'latest_event_at', null
    ) or v_context.events <> jsonb_build_array(
        jsonb_build_object(
            'normalized_status', 'in_transit',
            'occurred_at', '2026-07-21T11:00:00+00:00',
            'event_label', 'En transit',
            'event_date', '2026-07-21',
            'event_time', '11:00',
            'location', 'PARIS'
        ),
        jsonb_build_object(
            'normalized_status', 'carrier_accepted',
            'occurred_at', '2026-07-21T09:00:00+00:00',
            'event_label', 'Pris en charge',
            'event_date', '2026-07-21',
            'event_time', '09:00',
            'location', 'ROUEN'
        ),
        jsonb_build_object(
            'normalized_status', 'in_transit',
            'occurred_at', null,
            'event_label', 'Date inconnue',
            'event_date', null,
            'event_time', null,
            'location', null
        )
    ) then
        raise exception 'tracking summary: found projection or NULLS LAST order changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$found_contract$;

do $missing_contract$
declare
    v_context record;
begin
    select * into strict v_context
    from delivery.read_tracking_summary('87654321');
    if v_context.shipment is not null or v_context.events <> '[]'::jsonb then
        raise exception 'tracking summary: missing projection changed: %',
            pg_catalog.to_jsonb(v_context);
    end if;
end;
$missing_contract$;

rollback;
