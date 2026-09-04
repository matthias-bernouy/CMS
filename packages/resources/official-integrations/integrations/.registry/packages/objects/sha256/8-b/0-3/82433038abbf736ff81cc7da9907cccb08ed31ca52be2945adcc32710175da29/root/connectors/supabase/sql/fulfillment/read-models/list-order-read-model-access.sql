

revoke execute on function commerce.list_order_read_model(
    text, text, text, bigint, integer, bigint
) from public, anon, authenticated;
grant execute on function commerce.list_order_read_model(
    text, text, text, bigint, integer, bigint
) to service_role;