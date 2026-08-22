

revoke execute on function commerce.product_read_bundle(bigint, text, boolean, boolean)
    from public, anon, authenticated;
revoke execute on function commerce.get_product_read_model(text, bigint, text)
    from public, anon, authenticated;
revoke execute on function commerce.upsert_product_read_model(bigint, jsonb, integer)
    from public, anon, authenticated;
grant execute on function commerce.product_read_bundle(bigint, text, boolean, boolean)
    to service_role;
grant execute on function commerce.get_product_read_model(text, bigint, text) to service_role;
grant execute on function commerce.upsert_product_read_model(bigint, jsonb, integer)
    to service_role;