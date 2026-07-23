
revoke execute on function commerce.create_order_from_price_agreement(
    text, text, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
