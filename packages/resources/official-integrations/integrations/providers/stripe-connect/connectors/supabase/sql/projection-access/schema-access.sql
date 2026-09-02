

revoke all on all tables in schema stripe_connect from public, anon, authenticated;
revoke all on all functions in schema stripe_connect from public, anon, authenticated;

grant usage on schema stripe_connect to service_role;
grant select, insert, update, delete on all tables in schema stripe_connect to service_role;
grant usage, select on all sequences in schema stripe_connect to service_role;
grant execute on all functions in schema stripe_connect to service_role;