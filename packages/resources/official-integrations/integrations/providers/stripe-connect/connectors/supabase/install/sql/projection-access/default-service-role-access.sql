

alter default privileges in schema stripe_connect revoke execute on functions from public;
alter default privileges in schema stripe_connect grant select, insert, update, delete on tables to service_role;
alter default privileges in schema stripe_connect grant usage, select on sequences to service_role;
alter default privileges in schema stripe_connect grant execute on functions to service_role;
