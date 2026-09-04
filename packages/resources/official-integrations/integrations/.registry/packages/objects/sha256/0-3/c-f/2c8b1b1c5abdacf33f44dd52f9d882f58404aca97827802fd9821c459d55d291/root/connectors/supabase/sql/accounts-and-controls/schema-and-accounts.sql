

create schema if not exists stripe_connect;

revoke all on schema stripe_connect from public;
revoke all on schema stripe_connect from anon;
revoke all on schema stripe_connect from authenticated;

create table if not exists stripe_connect.accounts (
    cms_user_id text primary key,
    stripe_account_id text constraint accounts_stripe_account_id_key unique,
    stripe_account_api_version text not null default 'v1',
    application_controlled_recipient boolean not null default false,
    terms_accepted boolean not null default false,
    provider_account_closed boolean not null default false,
    external_bank_account_attached boolean not null default false,
    marketplace_terms_version text,
    marketplace_terms_hash text,
    marketplace_terms_accepted_at timestamptz,
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
    payout_schedule text not null default 'stripe_default',
    risk_status text not null default 'standard',
    financial_hold_reason text,
    outstanding_debt_amount bigint not null default 0,
    financial_exposure_amount bigint not null default 0,
    risk_revision bigint not null default 0,
    provider_hold_minimum_amount bigint not null default 0,
    payout_hold_claimed_by text,
    payout_hold_claimed_at timestamptz,
    payout_blocked_at timestamptz,
    manual_payout_hold_started_at timestamptz,
    manual_payout_hold_alert_at timestamptz,
    manual_payout_hold_deadline_at timestamptz,
    manual_payout_hold_restore_settings jsonb,
    last_onboarding_started_at timestamptz,
    last_provider_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounts_cms_user_id_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint accounts_stripe_account_id_format check (
        stripe_account_id is null or stripe_account_id like 'acct_%'
    ),
    constraint accounts_stripe_account_api_version_valid check (
        stripe_account_api_version in ('v1', 'v2')
    ),
    constraint accounts_country_format check (country = upper(country) and length(country) = 2),
    constraint accounts_marketplace_terms_snapshot_consistent check (
        (marketplace_terms_version is null
            and marketplace_terms_hash is null
            and marketplace_terms_accepted_at is null)
        or (length(btrim(marketplace_terms_version)) between 1 and 200
            and marketplace_terms_hash ~ '^[0-9a-f]{64}$'
            and marketplace_terms_accepted_at is not null)
    ),
    constraint accounts_business_type_valid check (
        business_type is null or business_type in ('company', 'government_entity', 'individual', 'non_profit')
    ),
    constraint accounts_onboarding_status_valid check (
        onboarding_status in (
            'not_started', 'link_created', 'onboarding_started',
            'requirements_due', 'pending_verification', 'enabled',
            'restricted', 'rejected'
        )
    ),
    constraint accounts_payout_schedule_valid check (
        payout_schedule in ('stripe_default', 'manual', 'daily', 'weekly', 'monthly')
    ),
    constraint accounts_risk_status_valid check (
        risk_status in ('standard', 'monitored', 'restricted', 'blocked', 'manual_review')
    ),
    constraint accounts_financial_risk_amounts check (
        outstanding_debt_amount between 0 and 9007199254740991
        and financial_exposure_amount between 0 and 9007199254740991
        and risk_revision between 0 and 9007199254740991
        and provider_hold_minimum_amount between 0 and 9007199254740991
    ),
    constraint accounts_manual_payout_hold_window check (
        (manual_payout_hold_started_at is null
            and manual_payout_hold_alert_at is null
            and manual_payout_hold_deadline_at is null
            and manual_payout_hold_restore_settings is null)
        or (manual_payout_hold_started_at is not null
            and manual_payout_hold_alert_at > manual_payout_hold_started_at
            and manual_payout_hold_deadline_at > manual_payout_hold_alert_at
            and jsonb_typeof(manual_payout_hold_restore_settings) = 'object')
    ),
    constraint accounts_capabilities_object check (jsonb_typeof(capabilities) = 'object'),
    constraint accounts_requirements_errors_array check (jsonb_typeof(requirements_errors) = 'array'),
    constraint accounts_future_requirements_object check (jsonb_typeof(future_requirements) = 'object')
);
