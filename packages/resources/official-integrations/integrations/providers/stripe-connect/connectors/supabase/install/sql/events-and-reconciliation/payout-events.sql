

create table if not exists stripe_connect.payout_events (
    id bigint generated always as identity primary key,
    cms_user_id text references stripe_connect.accounts(cms_user_id) on delete restrict,
    stripe_account_id text not null,
    stripe_payout_id text not null constraint payout_events_stripe_payout_id_key unique,
    amount bigint,
    currency text,
    status text not null,
    failure_code text,
    failure_message text,
    provider_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payout_events_account_format check (
        stripe_account_id = 'platform' or stripe_account_id like 'acct_%'
    ),
    constraint payout_events_id_format check (stripe_payout_id like 'po_%'),
    constraint payout_events_amount_non_negative check (amount is null or amount >= 0),
    constraint payout_events_snapshot_object check (jsonb_typeof(provider_snapshot) = 'object')
);

alter table stripe_connect.payout_events
    drop constraint if exists payout_events_account_format;
alter table stripe_connect.payout_events
    add constraint payout_events_account_format check (
        stripe_account_id = 'platform' or stripe_account_id like 'acct_%'
    );
