

alter default privileges in schema delivery
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema delivery
grant usage, select on sequences to service_role;

alter default privileges in schema delivery
grant execute on functions to service_role;