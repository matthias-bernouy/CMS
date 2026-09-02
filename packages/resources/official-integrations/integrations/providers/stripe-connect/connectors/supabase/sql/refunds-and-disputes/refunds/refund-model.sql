

create table if not exists stripe_connect.refunds (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    operation_id bigint not null unique references stripe_connect.financial_operations(id) on delete restrict,
    refund_request_id text not null unique,
    commerce_refund_request_id bigint unique,
    stripe_refund_id text unique,
    stripe_balance_transaction_id text unique,
    stripe_charge_id text not null,
    amount bigint not null,
    required_reversal_amount bigint not null default 0,
    seller_entitlement_reduction_amount bigint not null default 0,
    authorized_seller_amount_after_refund bigint not null default 0,
    currency text not null,
    reason text,
    status text not null default 'reserved',
    failure_reason text,
    actual_stripe_fee_amount bigint not null default 0,
    actual_stripe_net_amount bigint,
    actual_stripe_fee_currency text,
    actual_stripe_fee_details jsonb not null default '[]'::jsonb,
    provider_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint refunds_request_not_blank check (length(btrim(refund_request_id)) > 0),
    constraint refunds_commerce_request_positive check (
        commerce_refund_request_id is null or commerce_refund_request_id > 0
    ),
    constraint refunds_stripe_id_format check (stripe_refund_id is null or stripe_refund_id like 're_%'),
    constraint refunds_balance_transaction_format check (
        stripe_balance_transaction_id is null or stripe_balance_transaction_id like 'txn_%'
    ),
    constraint refunds_charge_format check (stripe_charge_id like 'ch_%'),
    constraint refunds_amount_positive check (amount > 0),
    constraint refunds_required_reversal_non_negative check (required_reversal_amount >= 0),
    constraint refunds_seller_entitlement_amounts check (
        seller_entitlement_reduction_amount >= 0
        and authorized_seller_amount_after_refund >= 0
    ),
    constraint refunds_currency_eur check (currency = 'eur'),
    constraint refunds_actual_stripe_costs check (
        actual_stripe_fee_amount between -9007199254740991 and 9007199254740991
        and (actual_stripe_net_amount is null
            or actual_stripe_net_amount between -9007199254740991 and 9007199254740991)
        and (actual_stripe_fee_currency is null or actual_stripe_fee_currency = currency)
        and jsonb_typeof(actual_stripe_fee_details) = 'array'
    ),
    constraint refunds_status_valid check (
        status in ('reserved', 'processing', 'pending', 'succeeded', 'failed', 'cancelled', 'manual_review')
    ),
    constraint refunds_snapshot_object check (
        provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'
    )
);

alter table stripe_connect.refunds
    add column if not exists commerce_refund_request_id bigint,
    add column if not exists seller_entitlement_reduction_amount bigint not null default 0,
    add column if not exists authorized_seller_amount_after_refund bigint not null default 0,
    add column if not exists stripe_balance_transaction_id text,
    add column if not exists actual_stripe_fee_amount bigint not null default 0,
    add column if not exists actual_stripe_net_amount bigint,
    add column if not exists actual_stripe_fee_currency text,
    add column if not exists actual_stripe_fee_details jsonb not null default '[]'::jsonb;

update stripe_connect.refunds
set seller_entitlement_reduction_amount = required_reversal_amount
where seller_entitlement_reduction_amount = 0 and required_reversal_amount > 0;

alter table stripe_connect.refunds
    drop constraint if exists refunds_commerce_request_positive,
    drop constraint if exists refunds_seller_entitlement_amounts,
    drop constraint if exists refunds_balance_transaction_format,
    drop constraint if exists refunds_actual_stripe_costs;

alter table stripe_connect.refunds
    add constraint refunds_commerce_request_positive check (
        commerce_refund_request_id is null or commerce_refund_request_id > 0
    ),
    add constraint refunds_seller_entitlement_amounts check (
        seller_entitlement_reduction_amount >= 0
        and authorized_seller_amount_after_refund >= 0
    ),
    add constraint refunds_balance_transaction_format check (
        stripe_balance_transaction_id is null or stripe_balance_transaction_id like 'txn_%'
    ),
    add constraint refunds_actual_stripe_costs check (
        actual_stripe_fee_amount between -9007199254740991 and 9007199254740991
        and (actual_stripe_net_amount is null
            or actual_stripe_net_amount between -9007199254740991 and 9007199254740991)
        and (actual_stripe_fee_currency is null or actual_stripe_fee_currency = currency)
        and jsonb_typeof(actual_stripe_fee_details) = 'array'
    );

create unique index if not exists refunds_commerce_refund_request_id_idx
    on stripe_connect.refunds(commerce_refund_request_id)
    where commerce_refund_request_id is not null;

create unique index if not exists refunds_balance_transaction_idx
    on stripe_connect.refunds(stripe_balance_transaction_id)
    where stripe_balance_transaction_id is not null;