

create schema if not exists broadcast;

revoke all on schema broadcast from public;
revoke all on schema broadcast from anon;
revoke all on schema broadcast from authenticated;

create table if not exists broadcast.campaigns (
    id uuid primary key default gen_random_uuid(),
    status text not null default 'draft' constraint campaigns_status_check check (
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
    status text not null default 'pending' constraint campaign_recipients_status_check check (
        status in ('pending', 'sending', 'sent', 'failed', 'skipped')
    ),
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_error text,
    message_id text,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint campaign_recipients_campaign_id_email_key unique (campaign_id, email),
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
