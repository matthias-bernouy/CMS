

alter table emailer.templates enable row level security;
alter table emailer.templates force row level security;
alter table emailer.messages enable row level security;
alter table emailer.messages force row level security;
alter table emailer.settings enable row level security;
alter table emailer.settings force row level security;

revoke all on all tables in schema emailer from public;
revoke all on all tables in schema emailer from anon;
revoke all on all tables in schema emailer from authenticated;
revoke all on all sequences in schema emailer from public;
revoke all on all sequences in schema emailer from anon;
revoke all on all sequences in schema emailer from authenticated;
revoke all on all functions in schema emailer from public;
revoke all on all functions in schema emailer from anon;
revoke all on all functions in schema emailer from authenticated;

grant usage on schema emailer to service_role;
grant select, insert, update, delete on all tables in schema emailer to service_role;
grant usage, select on all sequences in schema emailer to service_role;
grant execute on all functions in schema emailer to service_role;

alter default privileges in schema emailer
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema emailer
grant usage, select on sequences to service_role;
alter default privileges in schema emailer
grant execute on functions to service_role;

comment on schema emailer is
    'Private transactional email templates and delivery audit rows owned by Supabase Edge Functions.';
comment on table emailer.templates is
    'Transactional templates rendered by cms-emailer.';
comment on table emailer.messages is
    'Delivery audit rows written by cms-emailer.';
comment on table emailer.settings is
    'Provider-owned SMTP settings used by cms-emailer.';