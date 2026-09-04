

create or replace function delivery.shipment_creation_result(
    p_outcome text,
    p_shipment delivery.shipments
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'outcome', p_outcome,
        'shipment', pg_catalog.jsonb_build_object(
            'id', p_shipment.id,
            'status', p_shipment.status,
            'provider_call_started_at', p_shipment.provider_call_started_at,
            'expedition_number', p_shipment.expedition_number,
            'tracking_url', p_shipment.tracking_url,
            'created_at', p_shipment.created_at
        )
    )
$$;