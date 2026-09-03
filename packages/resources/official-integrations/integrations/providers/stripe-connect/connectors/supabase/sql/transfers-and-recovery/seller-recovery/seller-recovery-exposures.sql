

create table if not exists stripe_connect.seller_recovery_exposures (
    id bigint generated always as identity primary key,
    seller_cms_user_id text not null references stripe_connect.accounts(cms_user_id) on delete restrict,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_key text not null constraint seller_recovery_exposures_recovery_key_key unique,
    exposure_type text not null,
    status text not null,
    amount bigint not null,
    recovered_amount bigint not null default 0,
    currency text not null default 'eur',
    reason text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint seller_recovery_exposures_key check (length(btrim(recovery_key)) > 0),
    constraint seller_recovery_exposures_type check (
        exposure_type in ('chargeback', 'refund_recovery', 'reversal_failure')
    ),
    constraint seller_recovery_exposures_status check (
        status in ('at_risk', 'debt', 'recovered', 'waived')
    ),
    constraint seller_recovery_exposures_amounts check (
        amount between 1 and 9007199254740991
        and recovered_amount between 0 and amount
    ),
    constraint seller_recovery_exposures_currency check (currency = 'eur'),
    constraint seller_recovery_exposures_reason check (length(btrim(reason)) > 0),
    constraint seller_recovery_exposures_details check (jsonb_typeof(details) = 'object')
);

create index if not exists seller_recovery_exposures_account_status_idx
    on stripe_connect.seller_recovery_exposures(seller_cms_user_id, status, created_at desc);
