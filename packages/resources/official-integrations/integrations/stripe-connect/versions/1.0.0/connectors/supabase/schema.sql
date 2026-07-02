-- Supabase Stripe Connect schema for CMS-backed connected accounts and
-- destination-charge payments.
--
-- The CMS must not query these tables directly; the Edge Function owns all
-- reads and writes.

begin;

create schema if not exists stripe_connect;

revoke all on schema stripe_connect from public;
revoke all on schema stripe_connect from anon;
revoke all on schema stripe_connect from authenticated;

create table if not exists stripe_connect.accounts (
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
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounts_cms_user_id_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint accounts_stripe_account_id_format check (
        stripe_account_id is null or stripe_account_id like 'acct_%'
    ),
    constraint accounts_country_format check (country = upper(country) and length(country) = 2),
    constraint accounts_business_type_valid check (
        business_type is null or business_type in ('company', 'government_entity', 'individual', 'non_profit')
    ),
    constraint accounts_onboarding_status_valid check (
        onboarding_status in (
            'not_started',
            'link_created',
            'onboarding_started',
            'requirements_due',
            'pending_verification',
            'enabled',
            'restricted',
            'rejected'
        )
    ),
    constraint accounts_capabilities_object check (jsonb_typeof(capabilities) = 'object'),
    constraint accounts_requirements_errors_array check (jsonb_typeof(requirements_errors) = 'array'),
    constraint accounts_future_requirements_object check (jsonb_typeof(future_requirements) = 'object')
);

-- Re-apply mutable checks so connector redeploys update existing installations.
alter table stripe_connect.accounts
    drop constraint if exists accounts_onboarding_status_valid;

alter table stripe_connect.accounts
    add constraint accounts_onboarding_status_valid check (
        onboarding_status in (
            'not_started',
            'link_created',
            'onboarding_started',
            'requirements_due',
            'pending_verification',
            'enabled',
            'restricted',
            'rejected'
        )
    );

create table if not exists stripe_connect.payments (
    id bigint generated always as identity primary key,
    client_reference_id text unique,
    buyer_cms_user_id text not null,
    seller_cms_user_id text not null references stripe_connect.accounts(cms_user_id) on delete restrict,
    stripe_payment_intent_id text unique,
    stripe_charge_id text,
    transfer_group text unique,
    currency text not null default 'eur',
    amount_total integer not null,
    application_fee_amount integer not null default 0,
    seller_amount integer not null,
    status text not null default 'payment_pending',
    description text,
    paid_at timestamptz,
    cancelled_at timestamptz,
    refunded_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payments_client_reference_id_not_blank check (
        client_reference_id is null or length(btrim(client_reference_id)) > 0
    ),
    constraint payments_buyer_cms_user_id_not_blank check (length(btrim(buyer_cms_user_id)) > 0),
    constraint payments_seller_cms_user_id_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint payments_payment_intent_id_format check (
        stripe_payment_intent_id is null or stripe_payment_intent_id like 'pi_%'
    ),
    constraint payments_charge_id_format check (
        stripe_charge_id is null or stripe_charge_id like 'ch_%'
    ),
    constraint payments_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint payments_amount_total_positive check (amount_total > 0),
    constraint payments_application_fee_non_negative check (application_fee_amount >= 0),
    constraint payments_seller_amount_positive check (seller_amount > 0),
    constraint payments_amount_split_matches check (amount_total = application_fee_amount + seller_amount),
    constraint payments_status_valid check (
        status in (
            'payment_pending',
            'requires_action',
            'paid',
            'payment_failed',
            'cancelled',
            'partially_refunded',
            'refunded',
            'disputed'
        )
    )
);

create index if not exists accounts_stripe_account_id_idx
    on stripe_connect.accounts(stripe_account_id)
    where stripe_account_id is not null;

create index if not exists accounts_onboarding_status_idx
    on stripe_connect.accounts(onboarding_status);

create index if not exists payments_buyer_status_idx
    on stripe_connect.payments(buyer_cms_user_id, status);

create index if not exists payments_seller_status_idx
    on stripe_connect.payments(seller_cms_user_id, status);

create index if not exists payments_created_at_idx
    on stripe_connect.payments(created_at desc);

create index if not exists payments_stripe_payment_intent_id_idx
    on stripe_connect.payments(stripe_payment_intent_id)
    where stripe_payment_intent_id is not null;

create or replace function stripe_connect.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on stripe_connect.accounts;
create trigger accounts_set_updated_at
before update on stripe_connect.accounts
for each row execute function stripe_connect.set_updated_at();

drop trigger if exists payments_set_updated_at on stripe_connect.payments;
create trigger payments_set_updated_at
before update on stripe_connect.payments
for each row execute function stripe_connect.set_updated_at();

alter table stripe_connect.accounts enable row level security;
alter table stripe_connect.payments enable row level security;

alter table stripe_connect.accounts force row level security;
alter table stripe_connect.payments force row level security;

revoke all on all tables in schema stripe_connect from public;
revoke all on all tables in schema stripe_connect from anon;
revoke all on all tables in schema stripe_connect from authenticated;
revoke all on all functions in schema stripe_connect from public;
revoke all on all functions in schema stripe_connect from anon;
revoke all on all functions in schema stripe_connect from authenticated;

grant usage on schema stripe_connect to service_role;
grant select, insert, update, delete on all tables in schema stripe_connect to service_role;
grant usage, select on all sequences in schema stripe_connect to service_role;
grant execute on all functions in schema stripe_connect to service_role;

alter default privileges in schema stripe_connect
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema stripe_connect
grant usage, select on sequences to service_role;
alter default privileges in schema stripe_connect
grant execute on functions to service_role;

comment on schema stripe_connect is
    'Private Stripe Connect schema owned by Supabase Edge Functions.';
comment on table stripe_connect.accounts is
    'Stripe connected account state keyed by CMS user id.';
comment on table stripe_connect.payments is
    'Stripe destination-charge PaymentIntent state.';
comment on column stripe_connect.accounts.cms_user_id is
    'Stable user id computed by the CMS and forwarded as x-user-id.';
comment on column stripe_connect.accounts.stripe_account_id is
    'Stripe connected account id created for this CMS user.';
comment on column stripe_connect.payments.application_fee_amount is
    'Platform application fee in the smallest currency unit.';

commit;
