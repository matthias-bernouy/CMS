

revoke execute on function stripe_connect.list_dashboard_refunds(text, text, integer, text, text)
    from public, anon, authenticated;
revoke execute on function stripe_connect.read_dashboard_disputes(text, text, integer, text, text, text)
    from public, anon, authenticated;
revoke execute on function stripe_connect.list_dashboard_financial_operations(text, text, integer, text, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.list_dashboard_refunds(text, text, integer, text, text)
    to service_role;
grant execute on function stripe_connect.read_dashboard_disputes(text, text, integer, text, text, text)
    to service_role;
grant execute on function stripe_connect.list_dashboard_financial_operations(text, text, integer, text, text)
    to service_role;