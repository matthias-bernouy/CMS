

alter table stripe_connect.accounts
    add column if not exists stripe_account_api_version text not null default 'v1',
    add column if not exists application_controlled_recipient boolean not null default false,
    add column if not exists terms_accepted boolean not null default false,
    add column if not exists provider_account_closed boolean not null default false,
    add column if not exists external_bank_account_attached boolean not null default false,
    add column if not exists marketplace_terms_version text,
    add column if not exists marketplace_terms_hash text,
    add column if not exists marketplace_terms_accepted_at timestamptz,
    add column if not exists payout_schedule text not null default 'stripe_default',
    add column if not exists risk_status text not null default 'standard',
    add column if not exists financial_hold_reason text,
    add column if not exists outstanding_debt_amount bigint not null default 0,
    add column if not exists financial_exposure_amount bigint not null default 0,
    add column if not exists risk_revision bigint not null default 0,
    add column if not exists provider_hold_minimum_amount bigint not null default 0,
    add column if not exists payout_hold_claimed_by text,
    add column if not exists payout_hold_claimed_at timestamptz,
    add column if not exists payout_blocked_at timestamptz,
    add column if not exists manual_payout_hold_started_at timestamptz,
    add column if not exists manual_payout_hold_alert_at timestamptz,
    add column if not exists manual_payout_hold_deadline_at timestamptz,
    add column if not exists manual_payout_hold_restore_settings jsonb,
    add column if not exists last_provider_sync_at timestamptz;

alter table stripe_connect.accounts
    drop constraint if exists accounts_stripe_account_api_version_valid,
    drop constraint if exists accounts_marketplace_terms_snapshot_consistent,
    drop constraint if exists accounts_payout_schedule_valid,
    drop constraint if exists accounts_risk_status_valid,
    drop constraint if exists accounts_financial_risk_amounts,
    drop constraint if exists accounts_manual_payout_hold_window;

alter table stripe_connect.accounts
    add constraint accounts_stripe_account_api_version_valid check (
        stripe_account_api_version in ('v1', 'v2')
    ),
    add constraint accounts_marketplace_terms_snapshot_consistent check (
        (marketplace_terms_version is null
            and marketplace_terms_hash is null
            and marketplace_terms_accepted_at is null)
        or (length(btrim(marketplace_terms_version)) between 1 and 200
            and marketplace_terms_hash ~ '^[0-9a-f]{64}$'
            and marketplace_terms_accepted_at is not null)
    ),
    add constraint accounts_payout_schedule_valid check (
        payout_schedule in ('stripe_default', 'manual', 'daily', 'weekly', 'monthly')
    ),
    add constraint accounts_risk_status_valid check (
        risk_status in ('standard', 'monitored', 'restricted', 'blocked', 'manual_review')
    ),
    add constraint accounts_financial_risk_amounts check (
        outstanding_debt_amount between 0 and 9007199254740991
        and financial_exposure_amount between 0 and 9007199254740991
        and risk_revision between 0 and 9007199254740991
        and provider_hold_minimum_amount between 0 and 9007199254740991
    ),
    add constraint accounts_manual_payout_hold_window check (
        (manual_payout_hold_started_at is null
            and manual_payout_hold_alert_at is null
            and manual_payout_hold_deadline_at is null
            and manual_payout_hold_restore_settings is null)
        or (manual_payout_hold_started_at is not null
            and manual_payout_hold_alert_at > manual_payout_hold_started_at
            and manual_payout_hold_deadline_at > manual_payout_hold_alert_at
            and jsonb_typeof(manual_payout_hold_restore_settings) = 'object')
    );