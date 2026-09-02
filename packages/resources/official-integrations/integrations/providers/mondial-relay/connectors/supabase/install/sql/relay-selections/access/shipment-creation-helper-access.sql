

revoke execute on function delivery.shipment_address_matches(jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function delivery.shipment_address_matches(jsonb, jsonb)
    to service_role;
revoke execute on function delivery.shipment_reservation_matches(delivery.shipments, jsonb)
    from public, anon, authenticated;
grant execute on function delivery.shipment_reservation_matches(delivery.shipments, jsonb)
    to service_role;
revoke execute on function delivery.normalize_shipment_reservation(delivery.shipments, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function delivery.normalize_shipment_reservation(delivery.shipments, jsonb, jsonb)
    to service_role;
revoke execute on function delivery.shipment_creation_result(text, delivery.shipments)
    from public, anon, authenticated;
grant execute on function delivery.shipment_creation_result(text, delivery.shipments)
    to service_role;
revoke execute on function delivery.retry_shipment_creation(text, jsonb, timestamptz)
    from public, anon, authenticated;
grant execute on function delivery.retry_shipment_creation(text, jsonb, timestamptz)
    to service_role;