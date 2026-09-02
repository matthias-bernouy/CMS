

create table if not exists stripe_connect.payments (
    id bigint generated always as identity primary key,
    client_reference_id text not null unique,
    financial_terms_hash text not null,
    financial_revision integer not null default 1,
    dual_approval_threshold_amount bigint not null,
    buyer_cms_user_id text not null,
    seller_cms_user_id text not null references stripe_connect.accounts(cms_user_id) on delete restrict,
    seller_stripe_account_id text not null,
    stripe_payment_intent_id text unique,
    stripe_charge_id text unique,
    stripe_charge_balance_transaction_id text unique,
    last_stripe_event_id text,
    transfer_group text not null unique,
    currency text not null default 'eur',
    amount_total bigint not null,
    seller_transfer_amount bigint not null,
    platform_retained_amount bigint not null,
    refunded_amount bigint not null default 0,
    transferred_amount bigint not null default 0,
    reversed_amount bigint not null default 0,
    actual_stripe_charge_fee_amount bigint not null default 0,
    actual_stripe_refund_fee_amount bigint not null default 0,
    actual_stripe_processing_fee_amount bigint not null default 0,
    actual_stripe_charge_net_amount bigint,
    actual_stripe_fee_currency text,
    actual_stripe_charge_fee_details jsonb not null default '[]'::jsonb,
    payment_status text not null default 'created',
    settlement_status text not null default 'held',
    dispute_status text not null default 'none',
    description text,
    manual_review_reason text,
    paid_at timestamptz,
    cancelled_at timestamptz,
    last_provider_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payments_client_reference_id_not_blank check (length(btrim(client_reference_id)) > 0),
    constraint payments_financial_terms_hash_format check (financial_terms_hash ~ '^[a-f0-9]{64}$'),
    constraint payments_financial_revision_positive check (financial_revision > 0),
    constraint payments_dual_approval_threshold check (
        dual_approval_threshold_amount between 0 and 9007199254740991
    ),
    constraint payments_buyer_not_blank check (length(btrim(buyer_cms_user_id)) > 0),
    constraint payments_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint payments_seller_account_format check (seller_stripe_account_id like 'acct_%'),
    constraint payments_payment_intent_format check (
        stripe_payment_intent_id is null or stripe_payment_intent_id like 'pi_%'
    ),
    constraint payments_charge_format check (stripe_charge_id is null or stripe_charge_id like 'ch_%'),
    constraint payments_charge_balance_transaction_format check (
        stripe_charge_balance_transaction_id is null or stripe_charge_balance_transaction_id like 'txn_%'
    ),
    constraint payments_event_format check (last_stripe_event_id is null or last_stripe_event_id like 'evt_%'),
    constraint payments_currency_eur check (currency = 'eur'),
    constraint payments_actual_stripe_costs check (
        actual_stripe_charge_fee_amount between 0 and 9007199254740991
        and actual_stripe_refund_fee_amount between -9007199254740991 and 9007199254740991
        and actual_stripe_processing_fee_amount between -9007199254740991 and 9007199254740991
        and actual_stripe_processing_fee_amount = actual_stripe_charge_fee_amount + actual_stripe_refund_fee_amount
        and (actual_stripe_charge_net_amount is null
            or actual_stripe_charge_net_amount between -9007199254740991 and 9007199254740991)
        and (actual_stripe_fee_currency is null or actual_stripe_fee_currency = currency)
        and jsonb_typeof(actual_stripe_charge_fee_details) = 'array'
    ),
    constraint payments_amounts_valid check (
        amount_total > 0
        and seller_transfer_amount >= 0
        and platform_retained_amount >= 0
        and amount_total = seller_transfer_amount + platform_retained_amount
        and refunded_amount between 0 and amount_total
        and transferred_amount between 0 and 9007199254740991
        and reversed_amount between 0 and transferred_amount
        and transferred_amount - reversed_amount <= seller_transfer_amount
    ),
    constraint payments_payment_status_valid check (
        payment_status in ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled')
    ),
    constraint payments_settlement_status_valid check (
        settlement_status in (
            'held', 'eligible', 'release_pending', 'released', 'blocked',
            'refund_pending', 'refunded', 'reversal_pending', 'reversed', 'manual_review'
        )
    ),
    constraint payments_dispute_status_valid check (
        dispute_status in ('none', 'open', 'under_review', 'won', 'lost', 'prevented', 'warning_closed')
    )
);

alter table stripe_connect.payments
    add column if not exists dual_approval_threshold_amount bigint not null default 0,
    add column if not exists stripe_charge_balance_transaction_id text,
    add column if not exists actual_stripe_charge_fee_amount bigint not null default 0,
    add column if not exists actual_stripe_refund_fee_amount bigint not null default 0,
    add column if not exists actual_stripe_processing_fee_amount bigint not null default 0,
    add column if not exists actual_stripe_charge_net_amount bigint,
    add column if not exists actual_stripe_fee_currency text,
    add column if not exists actual_stripe_charge_fee_details jsonb not null default '[]'::jsonb;

alter table stripe_connect.payments
    drop constraint if exists payments_charge_balance_transaction_format,
    drop constraint if exists payments_actual_stripe_costs;

alter table stripe_connect.payments
    add constraint payments_charge_balance_transaction_format check (
        stripe_charge_balance_transaction_id is null or stripe_charge_balance_transaction_id like 'txn_%'
    ),
    add constraint payments_actual_stripe_costs check (
        actual_stripe_charge_fee_amount between 0 and 9007199254740991
        and actual_stripe_refund_fee_amount between -9007199254740991 and 9007199254740991
        and actual_stripe_processing_fee_amount between -9007199254740991 and 9007199254740991
        and actual_stripe_processing_fee_amount = actual_stripe_charge_fee_amount + actual_stripe_refund_fee_amount
        and (actual_stripe_charge_net_amount is null
            or actual_stripe_charge_net_amount between -9007199254740991 and 9007199254740991)
        and (actual_stripe_fee_currency is null or actual_stripe_fee_currency = currency)
        and jsonb_typeof(actual_stripe_charge_fee_details) = 'array'
    );

create unique index if not exists payments_charge_balance_transaction_idx
    on stripe_connect.payments(stripe_charge_balance_transaction_id)
    where stripe_charge_balance_transaction_id is not null;

alter table stripe_connect.payments
    drop constraint if exists payments_amounts_valid;

alter table stripe_connect.payments
    add constraint payments_amounts_valid check (
        amount_total > 0
        and seller_transfer_amount >= 0
        and platform_retained_amount >= 0
        and amount_total = seller_transfer_amount + platform_retained_amount
        and refunded_amount between 0 and amount_total
        and transferred_amount between 0 and 9007199254740991
        and reversed_amount between 0 and transferred_amount
        and transferred_amount - reversed_amount <= seller_transfer_amount
    );