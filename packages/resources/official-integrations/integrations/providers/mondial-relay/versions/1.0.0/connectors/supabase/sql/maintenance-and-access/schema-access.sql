

revoke all on all tables in schema delivery from public;
revoke all on all tables in schema delivery from anon;
revoke all on all tables in schema delivery from authenticated;
revoke all on all sequences in schema delivery from public;
revoke all on all sequences in schema delivery from anon;
revoke all on all sequences in schema delivery from authenticated;
revoke all on all functions in schema delivery from public;
revoke all on all functions in schema delivery from anon;
revoke all on all functions in schema delivery from authenticated;

grant usage on schema delivery to service_role;
grant select, insert, update, delete on all tables in schema delivery to service_role;
grant usage, select on all sequences in schema delivery to service_role;
grant execute on all functions in schema delivery to service_role;