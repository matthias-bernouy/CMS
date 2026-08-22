

revoke all on all tables in schema commerce from public, anon, authenticated;
revoke all on all sequences in schema commerce from public, anon, authenticated;
revoke all on all functions in schema commerce from public, anon, authenticated;

grant usage on schema commerce to service_role;
grant select on all tables in schema commerce to service_role;