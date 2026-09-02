

revoke execute on function delivery.reserve_shipment_creation(jsonb, jsonb, text, text, text, timestamptz)
    from public, anon, authenticated;
grant execute on function delivery.reserve_shipment_creation(jsonb, jsonb, text, text, text, timestamptz)
    to service_role;