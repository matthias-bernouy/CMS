

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