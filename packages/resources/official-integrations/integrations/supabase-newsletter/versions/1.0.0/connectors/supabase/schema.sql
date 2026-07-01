-- Supabase newsletter schema for a CMS-backed subscription source.
--
-- Run this SQL against the target Supabase database. The CMS must not query
-- this table directly; the Edge Function owns all reads and writes.

begin;

create schema if not exists newsletter;

revoke all on schema newsletter from public;
revoke all on schema newsletter from anon;
revoke all on schema newsletter from authenticated;

create table if not exists newsletter.subscriptions (
    email text primary key,
    subscribed boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint subscriptions_email_not_blank check (length(btrim(email)) > 0),
    constraint subscriptions_email_normalized check (email = lower(btrim(email))),
    constraint subscriptions_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index if not exists subscriptions_subscribed_idx
    on newsletter.subscriptions(subscribed);

create or replace function newsletter.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on newsletter.subscriptions;
create trigger subscriptions_set_updated_at
before update on newsletter.subscriptions
for each row execute function newsletter.set_updated_at();

alter table newsletter.subscriptions enable row level security;
alter table newsletter.subscriptions force row level security;

revoke all on all tables in schema newsletter from public;
revoke all on all tables in schema newsletter from anon;
revoke all on all tables in schema newsletter from authenticated;

grant usage on schema newsletter to service_role;
grant select, insert, update, delete on all tables in schema newsletter to service_role;

alter default privileges in schema newsletter
grant select, insert, update, delete on tables to service_role;

comment on schema newsletter is
    'Private newsletter schema owned by Supabase Edge Functions.';
comment on table newsletter.subscriptions is
    'Newsletter subscription state keyed by normalized email.';
comment on column newsletter.subscriptions.email is
    'Lowercase trimmed email address. This is the stable subscription key.';
comment on column newsletter.subscriptions.subscribed is
    'Current newsletter opt-in state.';

commit;
