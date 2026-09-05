

revoke execute on function commerce.get_order_detail_read_model(
    text, text, bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_detail_read_model(
    text, text, bigint, text
) to service_role;