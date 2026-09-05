

revoke execute on function stripe_connect.apply_payment_provider_projection(bigint, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function stripe_connect.apply_payment_provider_projection(bigint, jsonb, jsonb)
    to service_role;
