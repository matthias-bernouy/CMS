

revoke all on all tables in schema commerce_negotiation from public;
revoke all on all tables in schema commerce_negotiation from anon;
revoke all on all tables in schema commerce_negotiation from authenticated;
revoke all on all functions in schema commerce_negotiation from public;
revoke all on all functions in schema commerce_negotiation from anon;
revoke all on all functions in schema commerce_negotiation from authenticated;

grant usage on schema commerce_negotiation to service_role;
grant select, insert, update, delete on all tables in schema commerce_negotiation to service_role;
grant usage, select on all sequences in schema commerce_negotiation to service_role;
grant execute on all functions in schema commerce_negotiation to service_role;

alter default privileges in schema commerce_negotiation
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema commerce_negotiation
grant usage, select on sequences to service_role;
alter default privileges in schema commerce_negotiation
grant execute on functions to service_role;