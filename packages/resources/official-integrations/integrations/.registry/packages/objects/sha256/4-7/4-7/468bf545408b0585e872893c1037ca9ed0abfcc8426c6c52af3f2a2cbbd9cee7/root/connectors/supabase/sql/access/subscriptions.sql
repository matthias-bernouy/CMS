

alter table newsletter.subscriptions enable row level security;
alter table newsletter.subscriptions force row level security;

revoke all on all tables in schema newsletter from public;
revoke all on all tables in schema newsletter from anon;
revoke all on all tables in schema newsletter from authenticated;
revoke all on all functions in schema newsletter from public;
revoke all on all functions in schema newsletter from anon;
revoke all on all functions in schema newsletter from authenticated;

grant usage on schema newsletter to service_role;
grant select, insert, update, delete on all tables in schema newsletter to service_role;
grant execute on all functions in schema newsletter to service_role;

alter default privileges in schema newsletter
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema newsletter
grant execute on functions to service_role;

comment on schema newsletter is
    'Private newsletter schema owned by Supabase Edge Functions.';
comment on table newsletter.subscriptions is
    'Newsletter subscription state keyed by normalized email.';
comment on column newsletter.subscriptions.email is
    'Lowercase trimmed email address. This is the stable subscription key.';
comment on column newsletter.subscriptions.subscribed is
    'Current newsletter opt-in state.';