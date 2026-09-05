

revoke execute on function commerce.list_seller_offers_read_model(
    text, text, text, text, text, text, text, text, integer, bigint
) from public, anon, authenticated;
grant execute on function commerce.list_seller_offers_read_model(
    text, text, text, text, text, text, text, text, integer, bigint
) to service_role;