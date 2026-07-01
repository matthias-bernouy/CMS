-- Supabase marketplace schema for a CMS-backed Stripe Connect marketplace.
--
-- Run this SQL against the target Supabase database. The CMS must not query
-- these tables directly; Edge Functions own all reads and writes.

begin;

create schema if not exists marketplace;

revoke all on schema marketplace from public;
revoke all on schema marketplace from anon;
revoke all on schema marketplace from authenticated;

create table if not exists marketplace.profiles (
    cms_user_id text primary key,
    stripe_account_id text unique,
    country text not null default 'FR',
    business_type text,
    onboarding_status text not null default 'not_started',
    charges_enabled boolean not null default false,
    payouts_enabled boolean not null default false,
    details_submitted boolean not null default false,
    disabled_reason text,
    capabilities jsonb not null default '{}'::jsonb,
    requirements_currently_due text[] not null default '{}'::text[],
    requirements_eventually_due text[] not null default '{}'::text[],
    requirements_past_due text[] not null default '{}'::text[],
    requirements_pending_verification text[] not null default '{}'::text[],
    requirements_errors jsonb not null default '[]'::jsonb,
    future_requirements jsonb not null default '{}'::jsonb,
    last_onboarding_started_at timestamptz,
    last_stripe_event_id text,
    last_stripe_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_cms_user_id_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint profiles_stripe_account_id_format check (
        stripe_account_id is null or stripe_account_id like 'acct_%'
    ),
    constraint profiles_country_format check (country = upper(country) and length(country) = 2),
    constraint profiles_onboarding_status_valid check (
        onboarding_status in (
            'not_started',
            'link_created',
            'requirements_due',
            'pending_verification',
            'enabled',
            'restricted',
            'rejected'
        )
    ),
    constraint profiles_capabilities_object check (jsonb_typeof(capabilities) = 'object'),
    constraint profiles_requirements_errors_array check (jsonb_typeof(requirements_errors) = 'array'),
    constraint profiles_future_requirements_object check (jsonb_typeof(future_requirements) = 'object')
);

create table if not exists marketplace.orders (
    id bigint generated always as identity primary key,
    client_reference_id text unique,
    buyer_cms_user_id text not null,
    seller_cms_user_id text not null references marketplace.profiles(cms_user_id) on delete restrict,
    stripe_payment_intent_id text unique,
    stripe_charge_id text,
    transfer_group text unique,
    currency text not null default 'eur',
    amount_total integer not null,
    platform_fee_amount integer not null default 0,
    seller_amount integer not null,
    status text not null default 'draft',
    description text,
    metadata jsonb not null default '{}'::jsonb,
    paid_at timestamptz,
    cancelled_at timestamptz,
    refunded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint orders_buyer_cms_user_id_not_blank check (length(btrim(buyer_cms_user_id)) > 0),
    constraint orders_seller_cms_user_id_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint orders_payment_intent_id_format check (
        stripe_payment_intent_id is null or stripe_payment_intent_id like 'pi_%'
    ),
    constraint orders_charge_id_format check (
        stripe_charge_id is null or stripe_charge_id like 'ch_%'
    ),
    constraint orders_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint orders_amount_total_positive check (amount_total > 0),
    constraint orders_platform_fee_non_negative check (platform_fee_amount >= 0),
    constraint orders_seller_amount_positive check (seller_amount > 0),
    constraint orders_amount_split_matches check (amount_total = platform_fee_amount + seller_amount),
    constraint orders_status_valid check (
        status in (
            'draft',
            'payment_pending',
            'paid',
            'payment_failed',
            'cancelled',
            'transfer_pending',
            'transferred',
            'partially_refunded',
            'refunded',
            'disputed'
        )
    ),
    constraint orders_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists marketplace.transfers (
    id bigint generated always as identity primary key,
    order_id bigint not null references marketplace.orders(id) on delete restrict,
    seller_cms_user_id text not null references marketplace.profiles(cms_user_id) on delete restrict,
    stripe_transfer_id text unique,
    stripe_reversal_id text,
    idempotency_key text unique,
    currency text not null default 'eur',
    amount integer not null,
    reversed_amount integer not null default 0,
    status text not null default 'pending',
    failure_code text,
    failure_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transfers_transfer_id_format check (
        stripe_transfer_id is null or stripe_transfer_id like 'tr_%'
    ),
    constraint transfers_reversal_id_format check (
        stripe_reversal_id is null or stripe_reversal_id like 'trr_%'
    ),
    constraint transfers_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint transfers_amount_positive check (amount > 0),
    constraint transfers_reversed_amount_valid check (reversed_amount >= 0 and reversed_amount <= amount),
    constraint transfers_status_valid check (
        status in (
            'pending',
            'submitted',
            'paid',
            'failed',
            'partially_reversed',
            'reversed'
        )
    )
);

create table if not exists marketplace.stripe_events (
    event_id text primary key,
    event_type text not null,
    stripe_account_id text,
    stripe_object_id text,
    livemode boolean not null,
    api_version text,
    payload jsonb not null,
    status text not null default 'received',
    error_message text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    constraint stripe_events_event_id_format check (event_id like 'evt_%'),
    constraint stripe_events_type_not_blank check (length(btrim(event_type)) > 0),
    constraint stripe_events_account_id_format check (
        stripe_account_id is null or stripe_account_id like 'acct_%'
    ),
    constraint stripe_events_payload_object check (jsonb_typeof(payload) = 'object'),
    constraint stripe_events_status_valid check (
        status in ('received', 'processed', 'ignored', 'failed')
    )
);

create index if not exists profiles_stripe_account_id_idx
    on marketplace.profiles(stripe_account_id)
    where stripe_account_id is not null;

create index if not exists profiles_onboarding_status_idx
    on marketplace.profiles(onboarding_status);

create index if not exists orders_buyer_status_idx
    on marketplace.orders(buyer_cms_user_id, status);

create index if not exists orders_seller_status_idx
    on marketplace.orders(seller_cms_user_id, status);

create index if not exists orders_created_at_idx
    on marketplace.orders(created_at desc);

create index if not exists orders_stripe_payment_intent_id_idx
    on marketplace.orders(stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

create index if not exists transfers_order_id_idx
    on marketplace.transfers(order_id);

create unique index if not exists transfers_order_id_unique_idx
    on marketplace.transfers(order_id);

create index if not exists transfers_seller_status_idx
    on marketplace.transfers(seller_cms_user_id, status);

create index if not exists transfers_stripe_transfer_id_idx
    on marketplace.transfers(stripe_transfer_id)
    where stripe_transfer_id is not null;

create index if not exists stripe_events_status_received_at_idx
    on marketplace.stripe_events(status, received_at);

create index if not exists stripe_events_account_received_at_idx
    on marketplace.stripe_events(stripe_account_id, received_at desc)
    where stripe_account_id is not null;

create or replace function marketplace.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on marketplace.profiles;
create trigger profiles_set_updated_at
before update on marketplace.profiles
for each row execute function marketplace.set_updated_at();

drop trigger if exists orders_set_updated_at on marketplace.orders;
create trigger orders_set_updated_at
before update on marketplace.orders
for each row execute function marketplace.set_updated_at();

drop trigger if exists transfers_set_updated_at on marketplace.transfers;
create trigger transfers_set_updated_at
before update on marketplace.transfers
for each row execute function marketplace.set_updated_at();

alter table marketplace.profiles enable row level security;
alter table marketplace.orders enable row level security;
alter table marketplace.transfers enable row level security;
alter table marketplace.stripe_events enable row level security;

alter table marketplace.profiles force row level security;
alter table marketplace.orders force row level security;
alter table marketplace.transfers force row level security;
alter table marketplace.stripe_events force row level security;

revoke all on all tables in schema marketplace from public;
revoke all on all tables in schema marketplace from anon;
revoke all on all tables in schema marketplace from authenticated;
revoke all on all sequences in schema marketplace from public;
revoke all on all sequences in schema marketplace from anon;
revoke all on all sequences in schema marketplace from authenticated;

grant usage on schema marketplace to service_role;
grant select, insert, update, delete on all tables in schema marketplace to service_role;
grant usage, select on all sequences in schema marketplace to service_role;

alter default privileges in schema marketplace
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema marketplace
grant usage, select on sequences to service_role;

comment on schema marketplace is
    'Private marketplace schema owned by Supabase Edge Functions.';
comment on table marketplace.profiles is
    'One marketplace profile per CMS user id; stores Stripe Connect state.';
comment on table marketplace.orders is
    'Platform-side orders for separate charges and transfers.';
comment on table marketplace.transfers is
    'Transfers and transfer reversals to connected Stripe accounts.';
comment on table marketplace.stripe_events is
    'Stripe webhook idempotency and processing audit log.';

commit;
