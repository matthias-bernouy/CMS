revoke all on schema sales_configurator from public, anon, authenticated;
revoke all on all tables in schema sales_configurator
    from public, anon, authenticated;
revoke all on all sequences in schema sales_configurator
    from public, anon, authenticated;
revoke all on all functions in schema sales_configurator
    from public, anon, authenticated;

alter default privileges in schema sales_configurator
    revoke all on tables from public, anon, authenticated;
alter default privileges in schema sales_configurator
    revoke all on sequences from public, anon, authenticated;
alter default privileges in schema sales_configurator
    revoke execute on functions from public, anon, authenticated;
