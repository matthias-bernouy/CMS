

create or replace function delivery.get_projection_health()
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'checkedAt', now(),
    'pendingProjectionCount', (
        select count(*) from delivery.shipment_events event
        where event.normalized_status is not null and event.commerce_projected_at is null
          and event.projection_status in ('pending', 'processing', 'retry_wait')
    ),
    'manualReviewCount',
        (select count(*) from delivery.shipment_events event where event.projection_status = 'manual_review')
        + (select count(*) from delivery.shipments shipment where shipment.status in ('unknown', 'manual_review')),
    'trackingErrorCount', (
        select count(*) from delivery.shipments shipment
        where shipment.last_error is not null
          and shipment.status in (
              'created', 'label_ready', 'carrier_accepted', 'in_transit',
              'arrived_at_pickup_point', 'available_for_pickup', 'incident',
              'pickup_expired', 'returning_to_sender', 'cancelled_unscanned'
          )
    ),
    'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
            'externalOrderId', shipment.external_order_id,
            'shipmentId', shipment.id,
            'providerReference', shipment.expedition_number,
            'shipmentStatus', shipment.status,
            'pendingProjectionCount', (
                select count(*) from delivery.shipment_events event
                where event.shipment_id = shipment.id
                  and event.normalized_status is not null
                  and event.commerce_projected_at is null
                  and event.projection_status in ('pending', 'processing', 'retry_wait')
            ),
            'manualReviewCount',
                case when shipment.status in ('unknown', 'manual_review') then 1 else 0 end
                + (select count(*) from delivery.shipment_events event
                    where event.shipment_id = shipment.id
                      and event.projection_status = 'manual_review'),
            'trackingErrorCount', case
                when shipment.last_error is not null and shipment.status in (
                    'created', 'label_ready', 'carrier_accepted', 'in_transit',
                    'arrived_at_pickup_point', 'available_for_pickup', 'incident',
                    'pickup_expired', 'returning_to_sender', 'cancelled_unscanned'
                ) then 1 else 0 end,
            'trackingCheckedAt', shipment.tracking_checked_at
        ) order by shipment.created_at, shipment.id)
        from delivery.shipments shipment
        where shipment.external_order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ), '[]'::jsonb)
);
$$;