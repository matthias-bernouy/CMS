

revoke execute on function commerce.public_metadata_subset(jsonb, text[])
    from public, anon, authenticated;
revoke execute on function commerce.public_offer_items_read_model(bigint[], boolean)
    from public, anon, authenticated;
revoke execute on function commerce.list_public_offers_read_model(
    text, text, text, text, text, bigint, bigint, text, text, integer, integer
) from public, anon, authenticated;
revoke execute on function commerce.get_public_offer_read_model(bigint, text)
    from public, anon, authenticated;
revoke execute on function commerce.get_managed_offer_read_model(text, bigint, text, text)
    from public, anon, authenticated;
grant execute on function commerce.public_metadata_subset(jsonb, text[]) to service_role;
grant execute on function commerce.public_offer_items_read_model(bigint[], boolean) to service_role;
grant execute on function commerce.list_public_offers_read_model(
    text, text, text, text, text, bigint, bigint, text, text, integer, integer
) to service_role;
grant execute on function commerce.get_public_offer_read_model(bigint, text) to service_role;
grant execute on function commerce.get_managed_offer_read_model(text, bigint, text, text)
    to service_role;