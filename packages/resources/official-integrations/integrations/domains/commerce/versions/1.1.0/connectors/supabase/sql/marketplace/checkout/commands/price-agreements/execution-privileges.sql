
revoke execute on function commerce.register_price_agreement(
    text, text, integer, bigint, text, text, bigint, text, integer, timestamptz
) from public, anon, authenticated;
revoke execute on function commerce.cancel_price_agreement(text, text)
from public, anon, authenticated;
