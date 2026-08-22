
revoke execute on function commerce.get_offer_negotiation_context(bigint)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_negotiation_context(bigint)
    to service_role;
revoke execute on function commerce.lock_offer_negotiation_context(bigint)
    from public, anon, authenticated;
grant execute on function commerce.lock_offer_negotiation_context(bigint)
    to service_role;
