-- Supabase broadcast schema for durable newsletter email campaigns.
-- The CMS must access this schema through the cms-broadcast Edge Function.

begin;

create schema if not exists broadcast;

revoke all on schema broadcast from public;
revoke all on schema broadcast from anon;
revoke all on schema broadcast from authenticated;

create table if not exists broadcast.campaigns (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'draft' check (
        status in ('draft', 'scheduled', 'running', 'paused', 'done', 'canceled', 'failed')
    ),
    template_key text not null,
    shared_data jsonb not null default '{}'::jsonb,
    rate_per_minute integer not null default 60,
    scheduled_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    total_count integer not null default 0,
    sent_count integer not null default 0,
    failed_count integer not null default 0,
    skipped_count integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint campaigns_template_key_not_blank check (length(btrim(template_key)) > 0),
    constraint campaigns_rate_positive check (rate_per_minute between 1 and 10000)
);

create table if not exists broadcast.campaign_recipients (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references broadcast.campaigns(id) on delete cascade,
    email text not null,
    data jsonb not null default '{}'::jsonb,
    status text not null default 'pending' check (
        status in ('pending', 'sending', 'sent', 'failed', 'skipped')
    ),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_error text,
    message_id text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (campaign_id, email),
    constraint campaign_recipients_email_not_blank check (length(btrim(email)) > 0),
    constraint campaign_recipients_email_normalized check (email = lower(btrim(email)))
);

create index if not exists campaigns_status_scheduled_idx
    on broadcast.campaigns(status, scheduled_at, created_at);

create index if not exists campaign_recipients_pending_idx
    on broadcast.campaign_recipients(campaign_id, next_attempt_at)
    where status = 'pending';

create index if not exists campaign_recipients_status_idx
    on broadcast.campaign_recipients(campaign_id, status);

create or replace function broadcast.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists campaigns_set_updated_at on broadcast.campaigns;
create trigger campaigns_set_updated_at
before update on broadcast.campaigns
for each row execute function broadcast.set_updated_at();

drop trigger if exists campaign_recipients_set_updated_at on broadcast.campaign_recipients;
create trigger campaign_recipients_set_updated_at
before update on broadcast.campaign_recipients
for each row execute function broadcast.set_updated_at();

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

commit;
