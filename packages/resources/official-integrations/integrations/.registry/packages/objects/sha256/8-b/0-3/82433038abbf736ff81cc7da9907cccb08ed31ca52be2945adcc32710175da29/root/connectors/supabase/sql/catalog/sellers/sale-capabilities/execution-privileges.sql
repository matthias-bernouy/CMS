
revoke execute on function commerce.configure_sale_capability_requirement(
    text, text, boolean, text
) from public, anon, authenticated;
revoke execute on function commerce.record_seller_sale_capability(
    text, text, boolean, text
) from public, anon, authenticated;
revoke execute on function commerce.activate_sale_capability_requirement(
    text, text, text[], text, timestamptz
) from public, anon, authenticated;
