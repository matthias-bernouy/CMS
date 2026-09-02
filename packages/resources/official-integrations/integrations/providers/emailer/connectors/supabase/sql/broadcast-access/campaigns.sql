

alter table broadcast.campaigns enable row level security;
alter table broadcast.campaigns force row level security;
alter table broadcast.campaign_recipients enable row level security;
alter table broadcast.campaign_recipients force row level security;

revoke all on all tables in schema broadcast from public;
revoke all on all tables in schema broadcast from anon;
revoke all on all tables in schema broadcast from authenticated;
revoke all on all functions in schema broadcast from public;
revoke all on all functions in schema broadcast from anon;
revoke all on all functions in schema broadcast from authenticated;

grant usage on schema broadcast to service_role;
grant select, insert, update, delete on all tables in schema broadcast to service_role;
grant execute on all functions in schema broadcast to service_role;

alter default privileges in schema broadcast
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema broadcast
grant execute on functions to service_role;

comment on schema broadcast is
    'Private durable newsletter broadcast state owned by Supabase Edge Functions.';
comment on table broadcast.campaigns is
    'Email broadcast campaigns and aggregate progress counters.';
comment on table broadcast.campaign_recipients is
    'Snapshot recipients and per-recipient delivery state.';