-- Private Supabase ledger for Stripe Connect C2C protected payments.
-- Browsers never query this schema. The Edge Function is the authorization
-- boundary and all money movement is reserved through the RPC commands below.

begin;

create schema if not exists stripe_connect;

revoke all on schema stripe_connect from public;
revoke all on schema stripe_connect from anon;
revoke all on schema stripe_connect from authenticated;

create table if not exists stripe_connect.accounts (
    cms_user_id text primary key,
    stripe_account_id text unique,
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

create table if not exists stripe_connect.marketplace_terms_acceptances (
    cms_user_id text not null references stripe_connect.accounts(cms_user_id),
    terms_version text not null,
    terms_hash text not null,
    accepted_at timestamptz not null default now(),
    primary key (cms_user_id, terms_version),
    constraint marketplace_terms_acceptances_user_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint marketplace_terms_acceptances_version_valid check (
        length(btrim(terms_version)) between 1 and 200
    ),
    constraint marketplace_terms_acceptances_hash_valid check (terms_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists stripe_connect.platform_payout_controls (
    control_key text primary key default 'default',
    liability_revision bigint not null default 0,
    required_minimum_amount bigint not null default 0,
    provider_minimum_amount bigint not null default 0,
    decrease_authorization_id uuid,
    claim_owner text,
    claimed_at timestamptz,
    last_error text,
    last_provider_sync_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint platform_payout_controls_singleton check (control_key = 'default'),
    constraint platform_payout_controls_amounts_safe check (
        liability_revision between 0 and 9007199254740991
        and required_minimum_amount between 0 and 9007199254740991
        and provider_minimum_amount between 0 and 9007199254740991
    ),
    constraint platform_payout_controls_decrease_authorization check (
        decrease_authorization_id is null
        or required_minimum_amount < provider_minimum_amount
    ),
    constraint platform_payout_controls_claim_consistent check (
        (claim_owner is null and claimed_at is null)
        or (claim_owner is not null and length(btrim(claim_owner)) > 0 and claimed_at is not null)
    )
);

insert into stripe_connect.platform_payout_controls (control_key)
values ('default')
on conflict (control_key) do nothing;

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

alter table stripe_connect.payments
    drop constraint if exists payments_dispute_status_valid;

alter table stripe_connect.payments
    add constraint payments_dispute_status_valid check (
        dispute_status in ('none', 'open', 'under_review', 'won', 'lost', 'prevented', 'warning_closed')
    );

create table if not exists stripe_connect.payment_lifecycle_guards (
    client_reference_id text primary key,
    payment_id bigint unique references stripe_connect.payments(id) on delete restrict,
    cancellation_request_id text unique,
    cancellation_reason text,
    cancellation_requested_at timestamptz,
    payment_linked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payment_lifecycle_guards_reference_not_blank check (length(btrim(client_reference_id)) > 0),
    constraint payment_lifecycle_guards_cancellation_coherent check (
        (cancellation_request_id is null and cancellation_reason is null and cancellation_requested_at is null)
        or (length(btrim(cancellation_request_id)) > 0
            and length(btrim(cancellation_reason)) > 0
            and cancellation_requested_at is not null)
    ),
    constraint payment_lifecycle_guards_payment_coherent check (
        (payment_id is null and payment_linked_at is null)
        or (payment_id is not null and payment_linked_at is not null)
    )
);

insert into stripe_connect.payment_lifecycle_guards (
    client_reference_id, payment_id, payment_linked_at
)
select payment.client_reference_id, payment.id, payment.created_at
from stripe_connect.payments payment
on conflict (client_reference_id) do update set
    payment_id = coalesce(stripe_connect.payment_lifecycle_guards.payment_id, excluded.payment_id),
    payment_linked_at = coalesce(stripe_connect.payment_lifecycle_guards.payment_linked_at, excluded.payment_linked_at);

create table if not exists stripe_connect.payment_events (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    event_type text not null,
    actor_kind text not null,
    actor_id text not null,
    previous_payment_status text,
    next_payment_status text,
    previous_settlement_status text,
    next_settlement_status text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint payment_events_type_not_blank check (length(btrim(event_type)) > 0),
    constraint payment_events_actor_kind_valid check (
        actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')
    ),
    constraint payment_events_data_object check (jsonb_typeof(data) = 'object')
);

alter table stripe_connect.payment_events
    drop constraint if exists payment_events_actor_kind_valid,
    add constraint payment_events_actor_kind_valid check (
        actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')
    );

create table if not exists stripe_connect.financial_operations (
    id bigint generated always as identity primary key,
    payment_id bigint references stripe_connect.payments(id) on delete restrict,
    business_key text not null unique,
    operation_type text not null,
    status text not null default 'reserved',
    stripe_object_id text,
    request jsonb not null,
    response jsonb,
    last_error text,
    attempt_count integer not null default 0,
    next_attempt_at timestamptz,
    claimed_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint financial_operations_business_key_not_blank check (length(btrim(business_key)) > 0),
    constraint financial_operations_type_valid check (
        operation_type in (
            'payment_intent_create', 'payment_intent_cancel', 'transfer_create', 'transfer_reversal_create',
            'refund_create', 'dispute_evidence_submit', 'dispute_accept',
            'payout_schedule_update', 'provider_reconcile'
        )
    ),
    constraint financial_operations_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'manual_review')
    ),
    constraint financial_operations_request_object check (jsonb_typeof(request) = 'object'),
    constraint financial_operations_response_object check (
        response is null or jsonb_typeof(response) = 'object'
    ),
    constraint financial_operations_attempts_non_negative check (attempt_count >= 0)
);

alter table stripe_connect.financial_operations
    drop constraint if exists financial_operations_type_valid;
alter table stripe_connect.financial_operations
    add constraint financial_operations_type_valid check (
        operation_type in (
            'payment_intent_create', 'payment_intent_cancel', 'transfer_create', 'transfer_reversal_create',
            'refund_create', 'dispute_evidence_submit', 'dispute_accept',
            'payout_schedule_update', 'provider_reconcile'
        )
    );

create table if not exists stripe_connect.commerce_projection_outbox (
    id bigint generated always as identity primary key,
    operation_id bigint references stripe_connect.financial_operations(id) on delete restrict,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    projection_key text not null unique,
    projection_kind text not null,
    provider_object_id text,
    projection_payload jsonb not null default '{}'::jsonb,
    recovery_key text,
    causal_sequence integer not null default 0,
    projection_status text not null default 'pending',
    attempt_count integer not null default 0,
    next_attempt_at timestamptz,
    claim_owner text,
    claim_token uuid,
    claimed_at timestamptz,
    last_error text,
    projected_at timestamptz,
    intervention_revision bigint not null default 0,
    last_intervention_at timestamptz,
    last_intervention_by text,
    last_intervention_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint commerce_projection_outbox_kind check (
        projection_kind in ('payment', 'transfer', 'reversal', 'refund', 'dispute')
    ),
    constraint commerce_projection_outbox_status check (
        projection_status in ('pending', 'leased', 'retry', 'succeeded', 'manual_review')
    ),
    constraint commerce_projection_outbox_attempts check (
        attempt_count >= 0 and intervention_revision between 0 and 9007199254740991
    ),
    constraint commerce_projection_outbox_payload check (jsonb_typeof(projection_payload) = 'object'),
    constraint commerce_projection_outbox_identity check (
        (projection_kind in ('transfer', 'reversal', 'refund') and operation_id is not null)
        or (projection_kind in ('payment', 'dispute') and operation_id is null and provider_object_id is not null)
    ),
    constraint commerce_projection_outbox_claim check (
        (projection_status = 'leased' and claim_owner is not null and claim_token is not null and claimed_at is not null)
        or projection_status <> 'leased'
    )
);

alter table stripe_connect.commerce_projection_outbox
    add column if not exists projection_key text,
    add column if not exists provider_object_id text,
    add column if not exists projection_payload jsonb not null default '{}'::jsonb,
    add column if not exists intervention_revision bigint not null default 0,
    add column if not exists last_intervention_at timestamptz,
    add column if not exists last_intervention_by text,
    add column if not exists last_intervention_reason text,
    alter column operation_id drop not null;
alter table stripe_connect.commerce_projection_outbox
    drop constraint if exists commerce_projection_outbox_operation_id_key;
create unique index if not exists commerce_projection_outbox_operation_once_idx
    on stripe_connect.commerce_projection_outbox(operation_id)
    where projection_kind in ('transfer', 'reversal');
update stripe_connect.commerce_projection_outbox
set projection_key = 'operation:' || operation_id
where projection_key is null;
alter table stripe_connect.commerce_projection_outbox
    alter column projection_key set not null,
    drop constraint if exists commerce_projection_outbox_kind,
    drop constraint if exists commerce_projection_outbox_identity,
    drop constraint if exists commerce_projection_outbox_attempts,
    drop constraint if exists commerce_projection_outbox_payload;
alter table stripe_connect.commerce_projection_outbox
    add constraint commerce_projection_outbox_kind check (
        projection_kind in ('payment', 'transfer', 'reversal', 'refund', 'dispute')
    ),
    add constraint commerce_projection_outbox_identity check (
        (projection_kind in ('transfer', 'reversal', 'refund') and operation_id is not null)
        or (projection_kind in ('payment', 'dispute') and operation_id is null and provider_object_id is not null)
    ),
    add constraint commerce_projection_outbox_attempts check (
        attempt_count >= 0 and intervention_revision between 0 and 9007199254740991
    ),
    add constraint commerce_projection_outbox_payload check (
        jsonb_typeof(projection_payload) = 'object'
    );
drop index if exists stripe_connect.commerce_projection_outbox_projection_key_idx;

create index if not exists commerce_projection_outbox_claim_idx
    on stripe_connect.commerce_projection_outbox(projection_status, next_attempt_at, created_at, id);
create index if not exists commerce_projection_outbox_recovery_idx
    on stripe_connect.commerce_projection_outbox(recovery_key, causal_sequence, projection_status)
    where recovery_key is not null;

create table if not exists stripe_connect.commerce_projection_interventions (
    id bigint generated always as identity primary key,
    projection_id bigint not null references stripe_connect.commerce_projection_outbox(id) on delete restrict,
    intervention_revision bigint not null,
    action text not null,
    actor_id text not null,
    reason text not null,
    previous_status text not null,
    next_status text not null,
    created_at timestamptz not null default now(),
    constraint commerce_projection_interventions_revision check (intervention_revision > 0),
    constraint commerce_projection_interventions_action check (action = 'requeue'),
    constraint commerce_projection_interventions_actor check (length(btrim(actor_id)) > 0),
    constraint commerce_projection_interventions_reason check (length(btrim(reason)) > 0),
    constraint commerce_projection_interventions_unique unique (projection_id, intervention_revision)
);

create or replace function stripe_connect.enqueue_commerce_financial_projection()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_kind text;
    v_recovery_key text;
    v_sequence integer;
begin
    if new.status <> 'succeeded' or new.payment_id is null then return new; end if;
    v_kind := case new.operation_type
        when 'transfer_create' then 'transfer'
        when 'transfer_reversal_create' then 'reversal'
        else null
    end;
    if v_kind is null then return new; end if;
    v_recovery_key := case
        when v_kind = 'reversal' then nullif(new.request->>'recoveryRequestId', '')
        else null
    end;
    v_sequence := case
        when v_kind = 'reversal' then coalesce((new.request->>'allocationIndex')::integer, 0)
        else 0
    end;
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind, recovery_key, causal_sequence
    ) values (
        new.id, new.payment_id, 'operation:' || new.id, v_kind, v_recovery_key, v_sequence
    ) on conflict (projection_key) do nothing;
    return new;
end;
$$;

drop trigger if exists financial_operations_enqueue_commerce_projection
    on stripe_connect.financial_operations;
create trigger financial_operations_enqueue_commerce_projection
after insert or update of status on stripe_connect.financial_operations
for each row execute function stripe_connect.enqueue_commerce_financial_projection();

insert into stripe_connect.commerce_projection_outbox (
    operation_id, payment_id, projection_key, projection_kind, recovery_key, causal_sequence
)
select operation.id, operation.payment_id, 'operation:' || operation.id,
    case operation.operation_type
        when 'transfer_create' then 'transfer'
        when 'transfer_reversal_create' then 'reversal'
        else null
    end,
    case
        when operation.operation_type = 'transfer_reversal_create'
            then nullif(operation.request->>'recoveryRequestId', '')
        else null
    end,
    case
        when operation.operation_type = 'transfer_reversal_create'
            then coalesce((operation.request->>'allocationIndex')::integer, 0)
        else 0
    end
from stripe_connect.financial_operations operation
where operation.status = 'succeeded'
  and operation.payment_id is not null
  and operation.operation_type in ('transfer_create', 'transfer_reversal_create')
on conflict (projection_key) do nothing;

create or replace function stripe_connect.enqueue_commerce_provider_projection(
    p_payment_id bigint,
    p_projection_key text,
    p_projection_kind text,
    p_provider_object_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    if nullif(btrim(p_projection_key), '') is null
        or p_projection_kind not in ('payment', 'dispute')
        or nullif(btrim(p_provider_object_id), '') is null then
        raise exception 'validation: invalid Commerce provider projection';
    end if;
    if not exists (select 1 from stripe_connect.payments where id = p_payment_id) then
        raise exception 'not_found: payment';
    end if;
    insert into stripe_connect.commerce_projection_outbox (
        payment_id, projection_key, projection_kind, provider_object_id
    ) values (
        p_payment_id, p_projection_key, p_projection_kind, p_provider_object_id
    ) on conflict (projection_key) do nothing;
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where projection_key = p_projection_key;
    return to_jsonb(v_projection);
end;
$$;

insert into stripe_connect.commerce_projection_outbox (
    payment_id, projection_key, projection_kind, provider_object_id
)
select payment.id,
    'backfill:payment:' || payment.id || ':' || extract(epoch from payment.updated_at)::text,
    'payment', payment.id::text
from stripe_connect.payments payment
on conflict (projection_key) do nothing;

create table if not exists stripe_connect.transfers (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    operation_id bigint not null unique references stripe_connect.financial_operations(id) on delete restrict,
    release_authorization_id text not null unique,
    release_kind text not null default 'initial',
    stripe_transfer_id text unique,
    source_charge_id text,
    destination_account_id text not null,
    transfer_group text not null,
    amount bigint not null,
    currency text not null,
    status text not null default 'reserved',
    provider_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transfers_release_authorization_not_blank check (length(btrim(release_authorization_id)) > 0),
    constraint transfers_stripe_id_format check (stripe_transfer_id is null or stripe_transfer_id like 'tr_%'),
    constraint transfers_release_kind check (release_kind in ('initial', 'reserve', 'recovery')),
    constraint transfers_source_charge_format check (
        (release_kind in ('initial', 'reserve') and source_charge_id like 'ch_%')
        or (release_kind = 'recovery' and source_charge_id is null)
    ),
    constraint transfers_destination_format check (destination_account_id like 'acct_%'),
    constraint transfers_amount_positive check (amount > 0),
    constraint transfers_currency_eur check (currency = 'eur'),
    constraint transfers_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'partially_reversed', 'reversed', 'manual_review')
    ),
    constraint transfers_snapshot_object check (
        provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'
    )
);

alter table stripe_connect.transfers
    add column if not exists release_kind text not null default 'initial',
    alter column source_charge_id drop not null;
alter table stripe_connect.transfers
    drop constraint if exists transfers_release_kind,
    drop constraint if exists transfers_source_charge_format,
    drop constraint if exists transfers_status_valid;
alter table stripe_connect.transfers
    add constraint transfers_release_kind check (release_kind in ('initial', 'reserve', 'recovery')),
    add constraint transfers_source_charge_format check (
        (release_kind in ('initial', 'reserve') and source_charge_id like 'ch_%')
        or (release_kind = 'recovery' and source_charge_id is null)
    ),
    add constraint transfers_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'partially_reversed', 'reversed', 'manual_review')
    );

create table if not exists stripe_connect.transfer_recovery_requests (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_request_id text not null unique,
    exposure_type text not null,
    requested_amount bigint not null,
    allocated_amount bigint not null default 0,
    confirmed_amount bigint not null default 0,
    allocation_shortfall_amount bigint not null default 0,
    currency text not null,
    reason text,
    allocation_strategy text not null default 'newest_first',
    status text not null default 'reserved',
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transfer_recovery_requests_key check (length(btrim(recovery_request_id)) > 0),
    constraint transfer_recovery_requests_exposure check (
        exposure_type in ('chargeback', 'refund_recovery', 'manual')
    ),
    constraint transfer_recovery_requests_amounts check (
        requested_amount between 1 and 9007199254740991
        and allocated_amount between 0 and requested_amount
        and confirmed_amount between 0 and allocated_amount
        and allocation_shortfall_amount = requested_amount - allocated_amount
    ),
    constraint transfer_recovery_requests_currency check (currency = 'eur'),
    constraint transfer_recovery_requests_strategy check (allocation_strategy = 'newest_first'),
    constraint transfer_recovery_requests_status check (
        status in ('reserved', 'processing', 'partially_succeeded', 'succeeded', 'manual_review', 'failed')
    )
);

create index if not exists transfer_recovery_requests_payment_status_idx
    on stripe_connect.transfer_recovery_requests(payment_id, status, created_at desc);

create table if not exists stripe_connect.transfer_reversals (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_id bigint references stripe_connect.transfer_recovery_requests(id) on delete restrict,
    allocation_index integer,
    transfer_id bigint not null references stripe_connect.transfers(id) on delete restrict,
    operation_id bigint not null unique references stripe_connect.financial_operations(id) on delete restrict,
    reversal_request_id text not null unique,
    stripe_transfer_reversal_id text unique,
    amount bigint not null,
    currency text not null,
    reason text,
    status text not null default 'reserved',
    provider_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transfer_reversals_request_not_blank check (length(btrim(reversal_request_id)) > 0),
    constraint transfer_reversals_allocation check (
        (recovery_id is null and allocation_index is null)
        or (recovery_id is not null and allocation_index > 0)
    ),
    constraint transfer_reversals_stripe_id_format check (
        stripe_transfer_reversal_id is null or stripe_transfer_reversal_id like 'trr_%'
    ),
    constraint transfer_reversals_amount_positive check (amount > 0),
    constraint transfer_reversals_currency_eur check (currency = 'eur'),
    constraint transfer_reversals_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'manual_review')
    ),
    constraint transfer_reversals_snapshot_object check (
        provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'
    )
);

alter table stripe_connect.transfer_reversals
    add column if not exists recovery_id bigint references stripe_connect.transfer_recovery_requests(id) on delete restrict,
    add column if not exists allocation_index integer;
alter table stripe_connect.transfer_reversals
    drop constraint if exists transfer_reversals_allocation;
alter table stripe_connect.transfer_reversals
    add constraint transfer_reversals_allocation check (
        (recovery_id is null and allocation_index is null)
        or (recovery_id is not null and allocation_index > 0)
    );
create unique index if not exists transfer_reversals_recovery_allocation_idx
    on stripe_connect.transfer_reversals(recovery_id, allocation_index)
    where recovery_id is not null;
create unique index if not exists transfer_reversals_recovery_transfer_idx
    on stripe_connect.transfer_reversals(recovery_id, transfer_id)
    where recovery_id is not null;

create table if not exists stripe_connect.seller_recovery_exposures (
    id bigint generated always as identity primary key,
    seller_cms_user_id text not null references stripe_connect.accounts(cms_user_id) on delete restrict,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_key text not null unique,
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

drop function if exists stripe_connect.upsert_seller_recovery_exposure_and_refresh(
    text, bigint, text, text, text, bigint, text, text, jsonb
);
create or replace function stripe_connect.upsert_seller_recovery_exposure_and_refresh(
    p_seller_cms_user_id text,
    p_payment_id bigint,
    p_recovery_key text,
    p_exposure_type text,
    p_status text,
    p_amount bigint,
    p_currency text,
    p_reason text,
    p_details jsonb default '{}'::jsonb,
    p_recovered_amount bigint default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_payment stripe_connect.payments%rowtype;
    v_existing stripe_connect.seller_recovery_exposures%rowtype;
    v_exposure stripe_connect.seller_recovery_exposures%rowtype;
    v_next_status text;
    v_next_amount bigint;
    v_next_recovered_amount bigint;
    v_debt bigint;
    v_at_risk bigint;
    v_preserve_independent_risk boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_recovery_key is null or length(btrim(p_recovery_key)) = 0
        or p_payment_id is null or p_payment_id <= 0
        or p_amount is null or p_amount <= 0 or p_amount > 9007199254740991
        or p_recovered_amount is not null
            and (p_recovered_amount < 0 or p_recovered_amount > p_amount)
        or p_exposure_type not in ('chargeback', 'refund_recovery', 'reversal_failure')
        or p_status not in ('at_risk', 'debt', 'recovered')
        or p_currency <> 'eur'
        or p_reason is null or length(btrim(p_reason)) = 0
        or p_details is null or jsonb_typeof(p_details) <> 'object'
    then
        raise exception 'Invalid seller recovery exposure';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );

    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;

    select * into v_payment
      from stripe_connect.payments
     where id = p_payment_id;
    if not found
        or v_payment.seller_cms_user_id <> p_seller_cms_user_id
        or v_payment.currency <> p_currency
    then
        raise exception 'Seller recovery payment mismatch';
    end if;

    select * into v_existing
      from stripe_connect.seller_recovery_exposures
     where recovery_key = p_recovery_key
     for update;

    if found then
        if v_existing.seller_cms_user_id <> p_seller_cms_user_id
            or v_existing.payment_id <> p_payment_id
            or v_existing.currency <> p_currency
        then
            raise exception 'Seller recovery key replay mismatch';
        end if;
        v_next_status := case
            when v_existing.status in ('recovered', 'waived') then v_existing.status
            when v_existing.status = 'debt' and p_status = 'at_risk' then 'debt'
            else p_status
        end;
        v_next_amount := greatest(v_existing.amount, p_amount);
        v_next_recovered_amount := case
            when v_next_status in ('recovered', 'waived') then v_next_amount
            else least(
                v_next_amount,
                greatest(v_existing.recovered_amount, coalesce(p_recovered_amount, 0))
            )
        end;
        update stripe_connect.seller_recovery_exposures
           set exposure_type = case
                   when p_status = 'debt' then p_exposure_type
                   else exposure_type
               end,
               status = v_next_status,
               amount = v_next_amount,
               recovered_amount = v_next_recovered_amount,
               reason = p_reason,
               details = v_existing.details || p_details,
               updated_at = now()
         where id = v_existing.id
         returning * into v_exposure;
    else
        insert into stripe_connect.seller_recovery_exposures (
            seller_cms_user_id, payment_id, recovery_key, exposure_type, status,
            amount, recovered_amount, currency, reason, details
        ) values (
            p_seller_cms_user_id, p_payment_id, p_recovery_key, p_exposure_type, p_status,
            p_amount, case
                when p_status = 'recovered' then p_amount
                else coalesce(p_recovered_amount, 0)
            end,
            p_currency, p_reason, p_details
        )
        returning * into v_exposure;
    end if;

    select
        coalesce(sum(amount - recovered_amount) filter (where status = 'debt'), 0),
        coalesce(sum(amount - recovered_amount) filter (where status = 'at_risk'), 0)
      into v_debt, v_at_risk
      from stripe_connect.seller_recovery_exposures
     where seller_cms_user_id = p_seller_cms_user_id;

    v_preserve_independent_risk := v_account.risk_status <> 'standard'
        and coalesce(v_account.financial_hold_reason, '') not like 'Seller recovery%';

    update stripe_connect.accounts
       set outstanding_debt_amount = v_debt,
           financial_exposure_amount = v_at_risk,
           risk_revision = risk_revision + 1,
           risk_status = case
               when v_preserve_independent_risk then v_account.risk_status
               when v_debt > 0 then 'blocked'
               when v_at_risk > 0 then 'restricted'
               else 'standard'
           end,
           financial_hold_reason = case
               when v_preserve_independent_risk then v_account.financial_hold_reason
               when v_debt > 0 then 'Seller recovery debt blocks payments and payouts'
               when v_at_risk > 0 then 'Seller recovery exposure blocks payments and payouts'
               else null
           end,
           payout_blocked_at = case
               when v_debt > 0 or v_at_risk > 0 then coalesce(v_account.payout_blocked_at, now())
               else null
           end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;

    return jsonb_build_object('account', to_jsonb(v_account), 'exposure', to_jsonb(v_exposure));
end;
$$;

drop function if exists stripe_connect.claim_seller_payout_hold(text, text);

create or replace function stripe_connect.claim_seller_payout_hold(
    p_seller_cms_user_id text,
    p_owner text,
    p_require_risk boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_claimed boolean := false;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_require_risk is null
    then
        raise exception 'Invalid seller payout hold claim';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );
    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;

    if (not p_require_risk
            or v_account.outstanding_debt_amount + v_account.financial_exposure_amount > 0)
        and (
            v_account.payout_hold_claimed_by is null
            or v_account.payout_hold_claimed_by = p_owner
            or v_account.payout_hold_claimed_at is null
            or v_account.payout_hold_claimed_at < now() - interval '15 minutes'
        )
    then
        update stripe_connect.accounts
           set payout_hold_claimed_by = p_owner,
               payout_hold_claimed_at = now(),
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        v_claimed := true;
    end if;

    return jsonb_build_object('claimed', v_claimed, 'account', to_jsonb(v_account));
end;
$$;

drop function if exists stripe_connect.finalize_seller_payout_configuration(text, text, bigint, text, boolean);
drop function if exists stripe_connect.finalize_seller_payout_configuration(text, text, bigint, text);

create function stripe_connect.finalize_seller_payout_configuration(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint,
    p_interval text,
    p_clear_ambiguous_recovery_hold boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_superseded boolean;
    v_clear_ambiguous_recovery_hold boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
        or p_interval not in ('manual', 'daily', 'weekly', 'monthly')
        or p_clear_ambiguous_recovery_hold is null
    then
        raise exception 'Invalid seller payout configuration finalization';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );
    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;
    if v_account.payout_hold_claimed_by is distinct from p_owner then
        return jsonb_build_object('accepted', false, 'superseded', true, 'account', to_jsonb(v_account));
    end if;

    v_superseded := v_account.risk_revision <> p_expected_risk_revision
        or v_account.outstanding_debt_amount + v_account.financial_exposure_amount > 0;
    if v_superseded then
        update stripe_connect.accounts
           set payout_hold_claimed_at = now(),
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        return jsonb_build_object('accepted', true, 'superseded', true, 'account', to_jsonb(v_account));
    end if;

    v_clear_ambiguous_recovery_hold := p_clear_ambiguous_recovery_hold
        and v_account.risk_status = 'manual_review'
        and v_account.financial_hold_reason = 'Seller recovery payout hold is not confirmed'
        and v_account.outstanding_debt_amount = 0
        and v_account.financial_exposure_amount = 0;

    update stripe_connect.accounts
       set payout_schedule = p_interval,
           risk_status = case
               when v_clear_ambiguous_recovery_hold then 'standard'
               else risk_status
           end,
           financial_hold_reason = case
               when v_clear_ambiguous_recovery_hold then null
               else financial_hold_reason
           end,
           payout_blocked_at = case
               when v_clear_ambiguous_recovery_hold then null
               else payout_blocked_at
           end,
           last_provider_sync_at = now(),
           payout_hold_claimed_by = null,
           payout_hold_claimed_at = null,
           manual_payout_hold_started_at = null,
           manual_payout_hold_alert_at = null,
           manual_payout_hold_deadline_at = null,
           manual_payout_hold_restore_settings = null,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;
    return jsonb_build_object('accepted', true, 'superseded', false, 'account', to_jsonb(v_account));
end;
$$;

create or replace function stripe_connect.cancel_seller_payout_configuration(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_superseded boolean;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
    then
        raise exception 'Invalid seller payout configuration cancellation';
    end if;
    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );
    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;
    if v_account.payout_hold_claimed_by is distinct from p_owner then
        return jsonb_build_object('accepted', false, 'superseded', true, 'account', to_jsonb(v_account));
    end if;
    v_superseded := v_account.risk_revision <> p_expected_risk_revision
        or v_account.outstanding_debt_amount + v_account.financial_exposure_amount > 0;
    update stripe_connect.accounts
       set payout_hold_claimed_by = case when v_superseded then p_owner else null end,
           payout_hold_claimed_at = case when v_superseded then now() else null end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;
    return jsonb_build_object('accepted', true, 'superseded', v_superseded, 'account', to_jsonb(v_account));
end;
$$;

drop function if exists stripe_connect.complete_seller_payout_hold(text, text, bigint, bigint, boolean, text);
drop function if exists stripe_connect.complete_seller_payout_hold(text, text, bigint, bigint, boolean, text, jsonb);

create function stripe_connect.complete_seller_payout_hold(
    p_seller_cms_user_id text,
    p_owner text,
    p_expected_risk_revision bigint,
    p_applied_minimum_amount bigint,
    p_succeeded boolean,
    p_error text default null,
    p_restore_settings jsonb default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_required_hold bigint;
    v_needs_reapply boolean := false;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_risk_revision is null or p_expected_risk_revision < 0
        or p_applied_minimum_amount is null or p_applied_minimum_amount < 0
        or p_applied_minimum_amount > 9007199254740991
        or p_succeeded is null
        or (p_succeeded and jsonb_typeof(p_restore_settings) is distinct from 'object')
    then
        raise exception 'Invalid seller payout hold completion';
    end if;
    if p_succeeded and (
        coalesce(p_restore_settings->>'interval', '') not in ('manual', 'daily', 'weekly', 'monthly')
        or coalesce((p_restore_settings->>'minimumBalanceEur')::bigint, -1) < 0
        or exists (
            select 1
            from jsonb_object_keys(p_restore_settings) as setting(key)
            where setting.key not in (
                'interval', 'weeklyPayoutDays', 'monthlyPayoutDays', 'minimumBalanceEur',
                'delayDaysOverride', 'debitNegativeBalances'
            )
        )
    ) then
        raise exception 'Invalid seller payout hold restoration settings';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended('stripe-connect-seller-risk:' || p_seller_cms_user_id, 0)
    );
    select * into v_account
      from stripe_connect.accounts
     where cms_user_id = p_seller_cms_user_id
     for update;
    if not found then
        raise exception 'Stripe Connect account not found';
    end if;
    if v_account.payout_hold_claimed_by is distinct from p_owner then
        return jsonb_build_object('accepted', false, 'needsReapply', false, 'account', to_jsonb(v_account));
    end if;

    v_required_hold := v_account.outstanding_debt_amount + v_account.financial_exposure_amount;
    if not p_succeeded then
        update stripe_connect.accounts
           set risk_status = 'manual_review',
               financial_hold_reason = 'Seller recovery payout hold is not confirmed',
               payout_blocked_at = coalesce(payout_blocked_at, now()),
               payout_hold_claimed_by = null,
               payout_hold_claimed_at = null,
               updated_at = now()
         where cms_user_id = p_seller_cms_user_id
         returning * into v_account;
        return jsonb_build_object('accepted', true, 'needsReapply', false, 'account', to_jsonb(v_account));
    end if;

    v_needs_reapply := v_required_hold > p_applied_minimum_amount;
    update stripe_connect.accounts
       set provider_hold_minimum_amount = greatest(provider_hold_minimum_amount, p_applied_minimum_amount),
           payout_schedule = 'manual',
           manual_payout_hold_started_at = coalesce(manual_payout_hold_started_at, now()),
           manual_payout_hold_alert_at = coalesce(
               manual_payout_hold_alert_at,
               coalesce(manual_payout_hold_started_at, now()) + interval '75 days'
           ),
           manual_payout_hold_deadline_at = coalesce(
               manual_payout_hold_deadline_at,
               coalesce(manual_payout_hold_started_at, now()) + interval '90 days'
           ),
           manual_payout_hold_restore_settings = coalesce(
               manual_payout_hold_restore_settings,
               p_restore_settings
           ),
           last_provider_sync_at = now(),
           payout_hold_claimed_by = case when v_needs_reapply then p_owner else null end,
           payout_hold_claimed_at = case when v_needs_reapply then now() else null end,
           updated_at = now()
     where cms_user_id = p_seller_cms_user_id
     returning * into v_account;

    return jsonb_build_object(
        'accepted', true,
        'needsReapply', v_needs_reapply,
        'revisionChanged', v_account.risk_revision <> p_expected_risk_revision,
        'account', to_jsonb(v_account)
    );
end;
$$;

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

create or replace function stripe_connect.enqueue_commerce_refund_projection(
    p_refund_id bigint
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_refund stripe_connect.refunds%rowtype;
    v_projection stripe_connect.commerce_projection_outbox%rowtype;
    v_projection_key text;
    v_recovery_key text;
    v_sequence integer;
    v_payload jsonb;
begin
    select * into v_refund
    from stripe_connect.refunds
    where id = p_refund_id
    for share;
    if not found then raise exception 'not_found: refund'; end if;
    if v_refund.status not in ('pending', 'succeeded', 'failed', 'cancelled') then
        raise exception 'conflict: refund provider state is not projectable';
    end if;
    v_projection_key := 'refund:' || v_refund.id || ':' || v_refund.status;
    v_recovery_key := case when v_refund.required_reversal_amount > 0
        then v_refund.refund_request_id || ':seller-recovery' else null end;
    v_sequence := case when v_refund.status = 'pending' then 10 else 20 end;
    v_payload := jsonb_build_object(
        'refundId', v_refund.id,
        'refundRequestId', v_refund.refund_request_id,
        'commerceRefundRequestId', v_refund.commerce_refund_request_id,
        'stripeRefundId', v_refund.stripe_refund_id,
        'status', v_refund.status,
        'failureReason', v_refund.failure_reason,
        'providerSnapshot', coalesce(v_refund.provider_snapshot, '{}'::jsonb),
        'occurredAt', v_refund.updated_at
    );
    insert into stripe_connect.commerce_projection_outbox (
        operation_id, payment_id, projection_key, projection_kind,
        provider_object_id, projection_payload, recovery_key, causal_sequence
    ) values (
        v_refund.operation_id, v_refund.payment_id, v_projection_key, 'refund',
        coalesce(v_refund.stripe_refund_id, v_refund.id::text), v_payload,
        v_recovery_key, v_sequence
    ) on conflict (projection_key) do nothing;
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where projection_key = v_projection_key;
    if v_projection.operation_id is distinct from v_refund.operation_id
        or v_projection.payment_id is distinct from v_refund.payment_id then
        raise exception 'conflict: refund projection replay changed immutable provider state';
    end if;
    return to_jsonb(v_projection);
end;
$$;

create table if not exists stripe_connect.stripe_disputes (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    stripe_dispute_id text not null unique,
    stripe_charge_id text not null,
    amount bigint not null,
    currency text not null,
    reason text,
    status text not null,
    evidence_status text not null default 'not_started',
    evidence_due_by timestamptz,
    is_charge_refundable boolean,
    funds_withdrawn boolean not null default false,
    last_funds_event_at timestamptz,
    last_funds_event_id text,
    balance_transaction_ids text[] not null default '{}'::text[],
    provider_snapshot jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint stripe_disputes_id_format check (stripe_dispute_id like 'dp_%'),
    constraint stripe_disputes_charge_format check (stripe_charge_id like 'ch_%'),
    constraint stripe_disputes_amount_positive check (amount > 0),
    constraint stripe_disputes_currency_eur check (currency = 'eur'),
    constraint stripe_disputes_status_valid check (
        status in (
            'warning_needs_response', 'warning_under_review', 'warning_closed',
            'needs_response', 'under_review', 'won', 'lost', 'prevented'
        )
    ),
    constraint stripe_disputes_evidence_status_valid check (
        evidence_status in ('not_started', 'staged', 'submitted', 'accepted', 'closed')
    ),
    constraint stripe_disputes_snapshot_object check (jsonb_typeof(provider_snapshot) = 'object')
);

alter table stripe_connect.stripe_disputes
    add column if not exists funds_withdrawn boolean not null default false,
    add column if not exists last_funds_event_at timestamptz,
    add column if not exists last_funds_event_id text;

create or replace function stripe_connect.apply_dispute_funds_truth(
    p_stripe_dispute_id text,
    p_event_at timestamptz,
    p_event_id text,
    p_funds_withdrawn boolean
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_dispute stripe_connect.stripe_disputes%rowtype;
begin
    if nullif(btrim(p_stripe_dispute_id), '') is null
        or p_event_at is null
        or nullif(btrim(p_event_id), '') is null
        or p_funds_withdrawn is null
    then
        raise exception 'validation: invalid dispute funds truth';
    end if;
    select * into v_dispute
    from stripe_connect.stripe_disputes
    where stripe_dispute_id = p_stripe_dispute_id
    for update;
    if not found then raise exception 'not_found: Stripe dispute'; end if;
    if v_dispute.last_funds_event_at is null or p_event_at > v_dispute.last_funds_event_at then
        update stripe_connect.stripe_disputes
        set funds_withdrawn = p_funds_withdrawn,
            last_funds_event_at = p_event_at,
            last_funds_event_id = p_event_id
        where id = v_dispute.id
        returning * into v_dispute;
    elsif p_event_at = v_dispute.last_funds_event_at
        and p_funds_withdrawn is distinct from v_dispute.funds_withdrawn
    then
        update stripe_connect.stripe_disputes
        set funds_withdrawn = true,
            last_funds_event_id = 'same-second-conflict'
        where id = v_dispute.id
        returning * into v_dispute;
    end if;
    return to_jsonb(v_dispute);
end;
$$;

insert into stripe_connect.commerce_projection_outbox (
    payment_id, projection_key, projection_kind, provider_object_id
)
select dispute.payment_id,
    'backfill:dispute:' || dispute.id || ':' || extract(epoch from dispute.updated_at)::text,
    'dispute', dispute.id::text
from stripe_connect.stripe_disputes dispute
on conflict (projection_key) do nothing;

create table if not exists stripe_connect.stripe_dispute_evidence (
    id bigint generated always as identity primary key,
    dispute_id bigint not null references stripe_connect.stripe_disputes(id) on delete restrict,
    evidence_operation_id text not null unique,
    evidence jsonb not null,
    staged_by text not null,
    staged_at timestamptz not null default now(),
    submitted_operation_id bigint references stripe_connect.financial_operations(id) on delete restrict,
    submitted_at timestamptz,
    constraint stripe_dispute_evidence_operation_not_blank check (length(btrim(evidence_operation_id)) > 0),
    constraint stripe_dispute_evidence_object check (jsonb_typeof(evidence) = 'object'),
    constraint stripe_dispute_evidence_actor_not_blank check (length(btrim(staged_by)) > 0)
);

create table if not exists stripe_connect.irreversible_dispute_action_approvals (
    id bigint generated always as identity primary key,
    action_key text not null unique,
    action_type text not null,
    dispute_id bigint not null references stripe_connect.stripe_disputes(id) on delete restrict,
    amount bigint not null,
    threshold_amount bigint not null,
    payload_sha256 text not null,
    status text not null default 'pending_second_approval',
    first_actor_kind text not null,
    first_actor_id text not null,
    first_approved_at timestamptz not null default now(),
    second_actor_kind text,
    second_actor_id text,
    second_approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint irreversible_dispute_action_key check (length(btrim(action_key)) between 1 and 400),
    constraint irreversible_dispute_action_type check (action_type in ('dispute_evidence_submit', 'dispute_accept')),
    constraint irreversible_dispute_action_amount check (amount > 0 and threshold_amount >= 0),
    constraint irreversible_dispute_action_payload check (payload_sha256 ~ '^[a-f0-9]{64}$'),
    constraint irreversible_dispute_action_status check (status in ('pending_second_approval', 'approved')),
    constraint irreversible_dispute_action_first_actor check (
        first_actor_kind in ('finance', 'admin') and length(btrim(first_actor_id)) > 0
    ),
    constraint irreversible_dispute_action_second_actor check (
        (status = 'pending_second_approval' and second_actor_kind is null and second_actor_id is null and second_approved_at is null)
        or (status = 'approved' and second_actor_kind in ('finance', 'admin') and length(btrim(second_actor_id)) > 0
            and second_actor_id <> first_actor_id and second_approved_at is not null)
    )
);

alter table stripe_connect.irreversible_dispute_action_approvals
    drop constraint if exists irreversible_dispute_action_first_actor,
    drop constraint if exists irreversible_dispute_action_second_actor,
    add constraint irreversible_dispute_action_first_actor check (
        first_actor_kind in ('finance', 'admin') and length(btrim(first_actor_id)) > 0
    ),
    add constraint irreversible_dispute_action_second_actor check (
        (status = 'pending_second_approval' and second_actor_kind is null and second_actor_id is null and second_approved_at is null)
        or (status = 'approved' and second_actor_kind in ('finance', 'admin') and length(btrim(second_actor_id)) > 0
            and second_actor_id <> first_actor_id and second_approved_at is not null)
    );

create table if not exists stripe_connect.stripe_events (
    id bigint generated always as identity primary key,
    stripe_account_id text not null default 'platform',
    event_id text not null,
    event_type text not null,
    object_id text,
    api_version text,
    livemode boolean not null,
    provider_created_at timestamptz not null,
    payload_sha256 text not null,
    payload jsonb not null,
    processing_status text not null default 'pending',
    attempt_count integer not null default 0,
    processing_started_at timestamptz,
    last_error text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    unique (stripe_account_id, event_id),
    constraint stripe_events_event_id_not_blank check (length(btrim(event_id)) > 0),
    constraint stripe_events_event_type_not_blank check (length(btrim(event_type)) > 0),
    constraint stripe_events_payload_hash_format check (payload_sha256 ~ '^[a-f0-9]{64}$'),
    constraint stripe_events_payload_object check (jsonb_typeof(payload) = 'object'),
    constraint stripe_events_status_valid check (
        processing_status in ('pending', 'processing', 'processed', 'ignored', 'failed', 'manual_review')
    ),
    constraint stripe_events_attempts_non_negative check (attempt_count >= 0)
);

alter table stripe_connect.stripe_events
    add column if not exists processing_started_at timestamptz;

create index if not exists stripe_events_processing_claim_idx
    on stripe_connect.stripe_events(processing_status, processing_started_at, received_at, id)
    where processing_status in ('pending', 'failed', 'processing');

create table if not exists stripe_connect.payout_events (
    id bigint generated always as identity primary key,
    cms_user_id text references stripe_connect.accounts(cms_user_id) on delete restrict,
    stripe_account_id text not null,
    stripe_payout_id text not null unique,
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

create table if not exists stripe_connect.reconciliation_runs (
    id bigint generated always as identity primary key,
    run_key text not null unique,
    status text not null default 'running',
    scanned_count integer not null default 0,
    repaired_count integer not null default 0,
    exception_count integer not null default 0,
    details jsonb not null default '{}'::jsonb,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    constraint reconciliation_runs_key_not_blank check (length(btrim(run_key)) > 0),
    constraint reconciliation_runs_status_valid check (
        status in ('running', 'succeeded', 'failed', 'manual_review')
    ),
    constraint reconciliation_runs_counts_non_negative check (
        scanned_count >= 0 and repaired_count >= 0 and exception_count >= 0
    ),
    constraint reconciliation_runs_details_object check (jsonb_typeof(details) = 'object')
);

create table if not exists stripe_connect.provider_exceptions (
    id bigint generated always as identity primary key,
    deduplication_key text,
    payment_id bigint references stripe_connect.payments(id) on delete restrict,
    operation_id bigint references stripe_connect.financial_operations(id) on delete restrict,
    exception_type text not null,
    severity text not null default 'high',
    status text not null default 'open',
    message text not null,
    details jsonb not null default '{}'::jsonb,
    detected_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by text,
    constraint provider_exceptions_type_not_blank check (length(btrim(exception_type)) > 0),
    constraint provider_exceptions_severity_valid check (severity in ('medium', 'high', 'critical')),
    constraint provider_exceptions_status_valid check (status in ('open', 'investigating', 'resolved')),
    constraint provider_exceptions_message_not_blank check (length(btrim(message)) > 0),
    constraint provider_exceptions_details_object check (jsonb_typeof(details) = 'object')
);

alter table stripe_connect.provider_exceptions
    add column if not exists deduplication_key text;

do $$
begin
    if exists (
        select 1
        from pg_catalog.pg_index index_definition
        join pg_catalog.pg_class index_relation on index_relation.oid = index_definition.indexrelid
        join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
        where index_namespace.nspname = 'stripe_connect'
          and index_relation.relname = 'provider_exceptions_deduplication_key_idx'
          and index_definition.indpred is not null
    ) then
        drop index stripe_connect.provider_exceptions_deduplication_key_idx;
    end if;
end;
$$;

create unique index if not exists provider_exceptions_deduplication_key_idx
    on stripe_connect.provider_exceptions(deduplication_key);

create index if not exists accounts_onboarding_status_idx on stripe_connect.accounts(onboarding_status);
create index if not exists accounts_risk_status_idx on stripe_connect.accounts(risk_status);
create index if not exists payments_buyer_status_idx on stripe_connect.payments(buyer_cms_user_id, payment_status);
create index if not exists payments_seller_status_idx on stripe_connect.payments(seller_cms_user_id, settlement_status);
create index if not exists payments_created_at_idx on stripe_connect.payments(created_at desc);
create index if not exists payments_manual_review_idx on stripe_connect.payments(updated_at)
    where settlement_status = 'manual_review';
create index if not exists operations_pending_idx on stripe_connect.financial_operations(next_attempt_at, created_at)
    where status in ('reserved', 'processing', 'failed');
create index if not exists stripe_events_pending_idx on stripe_connect.stripe_events(received_at)
    where processing_status in ('pending', 'failed');
create index if not exists disputes_payment_status_idx on stripe_connect.stripe_disputes(payment_id, status);
create index if not exists stripe_disputes_created_at_idx
    on stripe_connect.stripe_disputes(created_at desc);
create index if not exists exceptions_open_idx on stripe_connect.provider_exceptions(severity, detected_at)
    where status <> 'resolved';
create index if not exists commerce_projection_outbox_payment_idx
    on stripe_connect.commerce_projection_outbox(payment_id);
create index if not exists financial_operations_payment_idx
    on stripe_connect.financial_operations(payment_id);
create index if not exists dispute_action_approvals_dispute_idx
    on stripe_connect.irreversible_dispute_action_approvals(dispute_id);
create index if not exists dispute_action_approvals_pending_idx
    on stripe_connect.irreversible_dispute_action_approvals(dispute_id, created_at desc)
    where status = 'pending_second_approval';
create index if not exists payment_events_payment_idx
    on stripe_connect.payment_events(payment_id);
create index if not exists payout_events_account_idx
    on stripe_connect.payout_events(cms_user_id);
create index if not exists provider_exceptions_operation_idx
    on stripe_connect.provider_exceptions(operation_id);
create index if not exists provider_exceptions_payment_idx
    on stripe_connect.provider_exceptions(payment_id);
create index if not exists refunds_payment_idx
    on stripe_connect.refunds(payment_id);
create index if not exists seller_recovery_exposures_payment_idx
    on stripe_connect.seller_recovery_exposures(payment_id);
create index if not exists stripe_dispute_evidence_dispute_idx
    on stripe_connect.stripe_dispute_evidence(dispute_id);
create index if not exists stripe_dispute_evidence_submitted_operation_idx
    on stripe_connect.stripe_dispute_evidence(submitted_operation_id);
create index if not exists transfer_reversals_payment_idx
    on stripe_connect.transfer_reversals(payment_id);
create index if not exists transfer_reversals_transfer_fk_idx
    on stripe_connect.transfer_reversals(transfer_id);
create index if not exists transfers_payment_idx
    on stripe_connect.transfers(payment_id);

create or replace function stripe_connect.list_dashboard_refunds(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text
)
returns table(refund jsonb, client_reference_id text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: the CMS admin role is required';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'validation: limit must be between 1 and 200';
    end if;
    return query
    with page as materialized (
        select refund_row.*
        from stripe_connect.refunds as refund_row
        where (p_status is null or refund_row.status = p_status)
          and (p_search is null
            or refund_row.refund_request_id ilike replace(p_search, '*', '%')
            or refund_row.stripe_refund_id ilike replace(p_search, '*', '%'))
        order by refund_row.created_at desc
        limit p_limit
    )
    select to_jsonb(refund_row), payment.client_reference_id
    from page as refund_row
    join stripe_connect.payments as payment on payment.id = refund_row.payment_id
    order by refund_row.created_at desc;
end;
$$;

create or replace function stripe_connect.read_dashboard_disputes(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text,
    p_dispute_id text
)
returns table(
    dispute jsonb,
    client_reference_id text,
    staged_evidence jsonb,
    evidence_submission_count integer,
    pending_approval jsonb
)
language plpgsql
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: the CMS admin role is required';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'validation: limit must be between 1 and 200';
    end if;
    return query
    with page as materialized (
        select dispute_row.*
        from stripe_connect.stripe_disputes as dispute_row
        where (p_dispute_id is null or dispute_row.stripe_dispute_id = p_dispute_id)
          and (p_dispute_id is not null or p_status is null or dispute_row.status = p_status)
          and (p_dispute_id is not null or p_search is null
            or dispute_row.stripe_dispute_id ilike replace(p_search, '*', '%')
            or dispute_row.stripe_charge_id ilike replace(p_search, '*', '%')
            or dispute_row.reason ilike replace(p_search, '*', '%'))
        order by dispute_row.created_at desc
        limit p_limit
    ), evidence_ranked as (
        select evidence.*,
            count(*) filter (where evidence.submitted_at is not null)
                over (partition by evidence.dispute_id) as submission_count,
            row_number() over (
                partition by evidence.dispute_id order by evidence.staged_at desc
            ) as evidence_rank
        from stripe_connect.stripe_dispute_evidence as evidence
        join page on page.id = evidence.dispute_id
    ), approval_ranked as (
        select approval.*,
            row_number() over (
                partition by approval.dispute_id order by approval.created_at desc
            ) as approval_rank
        from stripe_connect.irreversible_dispute_action_approvals as approval
        join page on page.id = approval.dispute_id
        where approval.status = 'pending_second_approval'
    )
    select to_jsonb(dispute_row), payment.client_reference_id,
        case when evidence.id is null then null else jsonb_build_object(
            'evidence_operation_id', evidence.evidence_operation_id,
            'staged_at', evidence.staged_at,
            'submitted_at', evidence.submitted_at
        ) end,
        coalesce(evidence.submission_count, 0)::integer,
        case when approval.id is null then null else jsonb_build_object(
            'action_type', approval.action_type,
            'status', approval.status,
            'first_actor_id', approval.first_actor_id,
            'first_approved_at', approval.first_approved_at,
            'second_actor_id', approval.second_actor_id,
            'second_approved_at', approval.second_approved_at
        ) end
    from page as dispute_row
    join stripe_connect.payments as payment on payment.id = dispute_row.payment_id
    left join evidence_ranked as evidence
        on evidence.dispute_id = dispute_row.id and evidence.evidence_rank = 1
    left join approval_ranked as approval
        on approval.dispute_id = dispute_row.id and approval.approval_rank = 1
    order by dispute_row.created_at desc;
end;
$$;

create or replace function stripe_connect.list_dashboard_financial_operations(
    p_actor_id text,
    p_actor_kind text,
    p_limit integer,
    p_search text,
    p_status text
)
returns table(operation jsonb, client_reference_id text, payment_currency text)
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: the CMS admin role is required';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'validation: limit must be between 1 and 200';
    end if;
    return query
    with page as materialized (
        select operation_row.*
        from stripe_connect.financial_operations as operation_row
        where (p_status is null or operation_row.status = p_status)
          and (p_search is null
            or operation_row.business_key ilike replace(p_search, '*', '%')
            or operation_row.stripe_object_id ilike replace(p_search, '*', '%')
            or operation_row.last_error ilike replace(p_search, '*', '%'))
        order by operation_row.created_at desc
        limit p_limit
    )
    select to_jsonb(operation_row), payment.client_reference_id, payment.currency
    from page as operation_row
    left join stripe_connect.payments as payment on payment.id = operation_row.payment_id
    order by operation_row.created_at desc;
end;
$$;

revoke execute on function stripe_connect.list_dashboard_refunds(text, text, integer, text, text)
    from public, anon, authenticated;
revoke execute on function stripe_connect.read_dashboard_disputes(text, text, integer, text, text, text)
    from public, anon, authenticated;
revoke execute on function stripe_connect.list_dashboard_financial_operations(text, text, integer, text, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.list_dashboard_refunds(text, text, integer, text, text)
    to service_role;
grant execute on function stripe_connect.read_dashboard_disputes(text, text, integer, text, text, text)
    to service_role;
grant execute on function stripe_connect.list_dashboard_financial_operations(text, text, integer, text, text)
    to service_role;

create or replace function stripe_connect.record_marketplace_terms_acceptance(
    p_cms_user_id text,
    p_terms_version text,
    p_terms_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_acceptance stripe_connect.marketplace_terms_acceptances%rowtype;
    v_version text := btrim(coalesce(p_terms_version, ''));
    v_hash text := lower(btrim(coalesce(p_terms_hash, '')));
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'validation: CMS user id is required';
    end if;
    if length(v_version) < 1 or length(v_version) > 200 then
        raise exception 'validation: marketplace terms version is invalid';
    end if;
    if v_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'validation: marketplace terms hash must be a SHA-256 hex digest';
    end if;

    select * into v_account
    from stripe_connect.accounts
    where cms_user_id = p_cms_user_id
    for update;
    if not found then
        raise exception 'not_found: Stripe Connect account';
    end if;

    insert into stripe_connect.marketplace_terms_acceptances (
        cms_user_id, terms_version, terms_hash
    ) values (
        p_cms_user_id, v_version, v_hash
    )
    on conflict (cms_user_id, terms_version) do nothing;

    select * into v_acceptance
    from stripe_connect.marketplace_terms_acceptances
    where cms_user_id = p_cms_user_id
      and terms_version = v_version;
    if v_acceptance.terms_hash is distinct from v_hash then
        raise exception 'conflict: marketplace terms version is already bound to another document hash';
    end if;

    if v_account.marketplace_terms_accepted_at is null
        or v_acceptance.accepted_at >= v_account.marketplace_terms_accepted_at then
        update stripe_connect.accounts
        set marketplace_terms_version = v_acceptance.terms_version,
            marketplace_terms_hash = v_acceptance.terms_hash,
            marketplace_terms_accepted_at = v_acceptance.accepted_at
        where cms_user_id = p_cms_user_id;
    end if;

    return jsonb_build_object(
        'cms_user_id', v_acceptance.cms_user_id,
        'terms_version', v_acceptance.terms_version,
        'terms_hash', v_acceptance.terms_hash,
        'accepted_at', v_acceptance.accepted_at
    );
end;
$$;

create or replace function stripe_connect.reject_marketplace_terms_acceptance_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'conflict: marketplace terms acceptance records are immutable';
end;
$$;

drop trigger if exists marketplace_terms_acceptances_immutable
    on stripe_connect.marketplace_terms_acceptances;
create trigger marketplace_terms_acceptances_immutable
before update or delete on stripe_connect.marketplace_terms_acceptances
for each row execute function stripe_connect.reject_marketplace_terms_acceptance_mutation();

create or replace function stripe_connect.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = greatest(old.updated_at, pg_catalog.clock_timestamp());
    return new;
end;
$$;

create or replace function stripe_connect.reserve_protected_payment(
    p_payment jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_client_reference_id text;
    v_guard stripe_connect.payment_lifecycle_guards%rowtype;
    v_payment stripe_connect.payments%rowtype;
begin
    if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
        raise exception 'validation: protected payment reservation must be an object';
    end if;
    v_client_reference_id := nullif(btrim(p_payment->>'client_reference_id'), '');
    if v_client_reference_id is null then
        raise exception 'validation: client reference id is required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe-connect:payment-lifecycle:' || v_client_reference_id, 0)
    );
    insert into stripe_connect.payment_lifecycle_guards (client_reference_id)
    values (v_client_reference_id)
    on conflict (client_reference_id) do nothing;
    select * into v_guard
    from stripe_connect.payment_lifecycle_guards
    where client_reference_id = v_client_reference_id
    for update;
    if v_guard.cancellation_request_id is not null then
        raise exception 'conflict: protected payment creation was cancelled before provider creation';
    end if;
    select * into v_payment
    from stripe_connect.payments
    where client_reference_id = v_client_reference_id
    for update;
    if not found then
        insert into stripe_connect.payments (
            client_reference_id, financial_terms_hash, financial_revision,
            dual_approval_threshold_amount, buyer_cms_user_id, seller_cms_user_id,
            seller_stripe_account_id, transfer_group, currency, amount_total,
            seller_transfer_amount, platform_retained_amount, payment_status,
            settlement_status, description
        ) values (
            v_client_reference_id,
            p_payment->>'financial_terms_hash',
            (p_payment->>'financial_revision')::integer,
            (p_payment->>'dual_approval_threshold_amount')::bigint,
            p_payment->>'buyer_cms_user_id',
            p_payment->>'seller_cms_user_id',
            p_payment->>'seller_stripe_account_id',
            p_payment->>'transfer_group',
            lower(p_payment->>'currency'),
            (p_payment->>'amount_total')::bigint,
            (p_payment->>'seller_transfer_amount')::bigint,
            (p_payment->>'platform_retained_amount')::bigint,
            coalesce(nullif(p_payment->>'payment_status', ''), 'created'),
            coalesce(nullif(p_payment->>'settlement_status', ''), 'held'),
            nullif(p_payment->>'description', '')
        ) returning * into v_payment;
    end if;
    update stripe_connect.payment_lifecycle_guards
    set payment_id = v_payment.id,
        payment_linked_at = coalesce(payment_linked_at, now())
    where client_reference_id = v_client_reference_id;
    return to_jsonb(v_payment);
end;
$$;

create or replace function stripe_connect.reserve_payment_cancellation_intent(
    p_client_reference_id text,
    p_cancellation_request_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_reference text := nullif(btrim(p_client_reference_id), '');
    v_cancellation_id text := nullif(btrim(p_cancellation_request_id), '');
    v_reason text := coalesce(nullif(btrim(p_reason), ''), 'Commerce requested provider payment cancellation');
    v_guard stripe_connect.payment_lifecycle_guards%rowtype;
    v_payment stripe_connect.payments%rowtype;
begin
    if v_reference is null or v_cancellation_id is null then
        raise exception 'validation: client reference and cancellation request ids are required';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe-connect:payment-lifecycle:' || v_reference, 0)
    );
    select * into v_payment
    from stripe_connect.payments
    where client_reference_id = v_reference
    for update;
    insert into stripe_connect.payment_lifecycle_guards (
        client_reference_id, payment_id, payment_linked_at
    ) values (
        v_reference, v_payment.id, case when v_payment.id is not null then now() end
    ) on conflict (client_reference_id) do update set
        payment_id = coalesce(stripe_connect.payment_lifecycle_guards.payment_id, excluded.payment_id),
        payment_linked_at = coalesce(stripe_connect.payment_lifecycle_guards.payment_linked_at, excluded.payment_linked_at);
    select * into v_guard
    from stripe_connect.payment_lifecycle_guards
    where client_reference_id = v_reference
    for update;
    if v_guard.cancellation_request_id is not null
        and (v_guard.cancellation_request_id <> v_cancellation_id
            or v_guard.cancellation_reason <> v_reason) then
        raise exception 'conflict: payment cancellation intent replay mismatch';
    end if;
    if v_guard.cancellation_request_id is null then
        update stripe_connect.payment_lifecycle_guards
        set cancellation_request_id = v_cancellation_id,
            cancellation_reason = v_reason,
            cancellation_requested_at = now()
        where client_reference_id = v_reference
        returning * into v_guard;
    end if;
    return jsonb_build_object(
        'clientReferenceId', v_reference,
        'cancellationRequestId', v_guard.cancellation_request_id,
        'paymentId', v_guard.payment_id,
        'providerPaymentAbsent', v_guard.payment_id is null,
        'requestedAt', v_guard.cancellation_requested_at
    );
end;
$$;

create or replace function stripe_connect.reserve_financial_operation(
    p_payment_id bigint,
    p_business_key text,
    p_operation_type text,
    p_request jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
    v_amount bigint;
    v_existing_amount bigint;
    v_reversed_amount bigint;
    v_seller_recovery_amount bigint;
    v_authorized_seller_amount bigint;
    v_unresolved_refund_count bigint;
begin
    if p_business_key is null or length(btrim(p_business_key)) = 0 then
        raise exception 'validation: business key is required';
    end if;
    if p_request is null or jsonb_typeof(p_request) <> 'object' then
        raise exception 'validation: operation request must be an object';
    end if;

    select * into v_payment from stripe_connect.payments where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;

    select * into v_operation
    from stripe_connect.financial_operations
    where business_key = p_business_key;
    if found then
        if v_operation.payment_id is distinct from p_payment_id
            or v_operation.operation_type is distinct from p_operation_type
            or v_operation.request is distinct from p_request then
            raise exception 'conflict: financial operation replay mismatch';
        end if;
        return to_jsonb(v_operation);
    end if;

    if p_operation_type = 'transfer_create' then
        if v_payment.payment_status <> 'succeeded'
            or v_payment.stripe_charge_id is null
            or v_payment.dispute_status not in ('none', 'won', 'prevented', 'warning_closed')
            or v_payment.settlement_status not in ('held', 'eligible', 'release_pending') then
            raise exception 'conflict: payment is not releasable';
        end if;
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfers
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'succeeded', 'partially_reversed', 'reversed');
        select coalesce(sum(amount), 0) into v_reversed_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status = 'succeeded';
        select coalesce(sum(seller_entitlement_reduction_amount), 0) into v_seller_recovery_amount
        from stripe_connect.refunds
        where payment_id = p_payment_id and status = 'succeeded';
        select count(*) into v_unresolved_refund_count
        from stripe_connect.refunds
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'pending', 'manual_review');
        v_authorized_seller_amount := v_payment.seller_transfer_amount - v_seller_recovery_amount;
        if v_unresolved_refund_count > 0 then
            raise exception 'conflict: unresolved refund blocks seller release';
        end if;
        if v_amount <= 0
            or v_existing_amount - v_reversed_amount + v_amount > v_authorized_seller_amount then
            raise exception 'conflict: transfer exceeds authorized seller amount';
        end if;
        update stripe_connect.payments set settlement_status = 'release_pending' where id = p_payment_id;
    elsif p_operation_type = 'transfer_reversal_create' then
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status in ('reserved', 'processing', 'succeeded');
        if v_amount <= 0 or v_existing_amount + v_amount > v_payment.transferred_amount then
            raise exception 'conflict: payment has no reversible transfer';
        end if;
        update stripe_connect.payments
        set settlement_status = 'reversal_pending'
        where id = p_payment_id
          and settlement_status not in ('blocked', 'manual_review', 'refund_pending');
    elsif p_operation_type = 'refund_create' then
        if v_payment.payment_status <> 'succeeded' or v_payment.stripe_charge_id is null then
            raise exception 'conflict: payment is not refundable';
        end if;
        select count(*) into v_unresolved_refund_count
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status in ('reserved', 'processing', 'manual_review');
        if v_unresolved_refund_count > 0 then
            raise exception 'conflict: another refund is awaiting terminal provider confirmation';
        end if;
        v_amount := (p_request->>'amount')::bigint;
        select coalesce(sum((operation.request->>'amount')::bigint), 0) into v_existing_amount
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status <> 'failed';
        if v_amount <= 0 or v_existing_amount + v_amount > v_payment.amount_total then
            raise exception 'conflict: refund exceeds captured amount';
        end if;
        select coalesce(sum((operation.request->>'sellerEntitlementReductionAmount')::bigint), 0)
        into v_seller_recovery_amount
        from stripe_connect.financial_operations operation
        where operation.payment_id = p_payment_id
          and operation.operation_type = 'refund_create'
          and operation.status <> 'failed';
        v_seller_recovery_amount := v_seller_recovery_amount
            + coalesce((p_request->>'sellerEntitlementReductionAmount')::bigint, 0);
        v_authorized_seller_amount := v_payment.seller_transfer_amount - v_seller_recovery_amount;
        if v_authorized_seller_amount < 0
            or v_authorized_seller_amount is distinct from
                coalesce((p_request->>'authorizedSellerAmount')::bigint, -1) then
            raise exception 'conflict: refund seller entitlement target is stale or invalid';
        end if;
        select coalesce(sum(amount), 0) into v_existing_amount
        from stripe_connect.transfers
        where payment_id = p_payment_id
          and status in ('reserved', 'processing', 'succeeded', 'partially_reversed', 'reversed');
        select coalesce(sum(amount), 0) into v_reversed_amount
        from stripe_connect.transfer_reversals
        where payment_id = p_payment_id and status = 'succeeded';
        if v_existing_amount - v_reversed_amount > v_authorized_seller_amount then
            raise exception 'conflict: required Transfer Reversal is not confirmed or a Transfer is in flight';
        end if;
        update stripe_connect.payments set settlement_status = 'refund_pending' where id = p_payment_id;
    end if;

    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, request
    ) values (
        p_payment_id, p_business_key, p_operation_type, p_request
    ) returning * into v_operation;

    return to_jsonb(v_operation);
end;
$$;

create or replace function stripe_connect.reserve_transfer_recovery(
    p_payment_id bigint,
    p_recovery_request_id text,
    p_amount bigint,
    p_exposure_type text,
    p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_recovery stripe_connect.transfer_recovery_requests%rowtype;
    v_transfer stripe_connect.transfers%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
    v_reversal stripe_connect.transfer_reversals%rowtype;
    v_reserved bigint;
    v_available bigint;
    v_allocation bigint;
    v_allocated bigint := 0;
    v_remaining bigint;
    v_index integer := 0;
    v_child_key text;
    v_business_key text;
    v_allocations jsonb;
begin
    if p_recovery_request_id is null or length(btrim(p_recovery_request_id)) = 0 then
        raise exception 'validation: recovery request id is required';
    end if;
    if p_amount is null or p_amount <= 0 then
        raise exception 'validation: recovery amount must be positive';
    end if;
    if p_exposure_type not in ('chargeback', 'refund_recovery', 'manual') then
        raise exception 'validation: recovery exposure type is invalid';
    end if;
    select * into v_payment from stripe_connect.payments
    where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;

    select * into v_recovery from stripe_connect.transfer_recovery_requests
    where recovery_request_id = p_recovery_request_id for update;
    if found then
        if v_recovery.payment_id is distinct from p_payment_id
            or v_recovery.requested_amount is distinct from p_amount
            or v_recovery.currency is distinct from v_payment.currency
            or v_recovery.exposure_type is distinct from p_exposure_type
            or v_recovery.reason is distinct from p_reason then
            raise exception 'conflict: transfer recovery replay mismatch';
        end if;
    else
        insert into stripe_connect.transfer_recovery_requests (
            payment_id, recovery_request_id, exposure_type,
            requested_amount, currency, reason
        ) values (
            p_payment_id, p_recovery_request_id, p_exposure_type,
            p_amount, v_payment.currency, p_reason
        ) returning * into v_recovery;

        v_remaining := p_amount;
        for v_transfer in
            select transfer.*
            from stripe_connect.transfers transfer
            where transfer.payment_id = p_payment_id
              and transfer.status in ('succeeded', 'partially_reversed')
              and transfer.stripe_transfer_id is not null
            order by transfer.created_at desc, transfer.id desc
            for update
        loop
            -- The link projects at most 24 operations atomically: 23 reversal
            -- children followed by one refund. Anything larger fails closed as
            -- an allocation shortfall instead of succeeding only at Stripe.
            exit when v_index >= 23;
            select coalesce(sum(reversal.amount), 0) into v_reserved
            from stripe_connect.transfer_reversals reversal
            where reversal.transfer_id = v_transfer.id
              and reversal.status in ('reserved', 'processing', 'succeeded', 'manual_review');
            v_available := greatest(0, v_transfer.amount - v_reserved);
            if v_available = 0 then continue; end if;
            v_allocation := least(v_remaining, v_available);
            v_index := v_index + 1;
            v_child_key := p_recovery_request_id || ':part:' || v_index || ':transfer:' || v_transfer.id;
            v_business_key := 'reversal:' || p_payment_id || ':' || v_child_key;
            insert into stripe_connect.financial_operations (
                payment_id, business_key, operation_type, request
            ) values (
                p_payment_id, v_business_key, 'transfer_reversal_create',
                jsonb_build_object(
                    'recoveryRequestId', p_recovery_request_id,
                    'reversalRequestId', v_child_key,
                    'transferId', v_transfer.stripe_transfer_id,
                    'amount', v_allocation,
                    'currency', v_payment.currency,
                    'reason', p_reason,
                    'allocationIndex', v_index
                )
            ) returning * into v_operation;
            insert into stripe_connect.transfer_reversals (
                payment_id, recovery_id, allocation_index, transfer_id,
                operation_id, reversal_request_id, amount, currency, reason, status
            ) values (
                p_payment_id, v_recovery.id, v_index, v_transfer.id,
                v_operation.id, v_child_key, v_allocation, v_payment.currency,
                p_reason, 'reserved'
            ) returning * into v_reversal;
            v_allocated := v_allocated + v_allocation;
            v_remaining := v_remaining - v_allocation;
            exit when v_remaining = 0;
        end loop;
        update stripe_connect.transfer_recovery_requests set
            allocated_amount = v_allocated,
            allocation_shortfall_amount = p_amount - v_allocated,
            status = case when v_allocated = 0 then 'manual_review' else 'reserved' end,
            last_error = case when v_allocated < p_amount
                then 'confirmed Transfers cannot cover the requested recovery' end
        where id = v_recovery.id returning * into v_recovery;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'reversal', to_jsonb(reversal),
        'operation', to_jsonb(operation_row),
        'transfer', to_jsonb(transfer_row)
    ) order by reversal.allocation_index), '[]'::jsonb)
    into v_allocations
    from stripe_connect.transfer_reversals reversal
    join stripe_connect.financial_operations operation_row on operation_row.id = reversal.operation_id
    join stripe_connect.transfers transfer_row on transfer_row.id = reversal.transfer_id
    where reversal.recovery_id = v_recovery.id;
    return jsonb_build_object(
        'recovery', to_jsonb(v_recovery),
        'allocations', v_allocations
    );
end;
$$;

create or replace function stripe_connect.reserve_account_financial_operation(
    p_cms_user_id text,
    p_business_key text,
    p_operation_type text,
    p_request jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_account stripe_connect.accounts%rowtype;
    v_operation stripe_connect.financial_operations%rowtype;
begin
    if p_cms_user_id is null or length(btrim(p_cms_user_id)) = 0 then
        raise exception 'validation: CMS user id is required';
    end if;
    if p_business_key is null or length(btrim(p_business_key)) = 0 then
        raise exception 'validation: business key is required';
    end if;
    if p_operation_type <> 'payout_schedule_update' then
        raise exception 'validation: unsupported account financial operation';
    end if;
    if p_request is null or jsonb_typeof(p_request) <> 'object' then
        raise exception 'validation: operation request must be an object';
    end if;

    select * into v_account
    from stripe_connect.accounts
    where cms_user_id = p_cms_user_id
    for update;
    if not found or v_account.stripe_account_id is null then
        raise exception 'not_found: connected account';
    end if;

    select * into v_operation
    from stripe_connect.financial_operations
    where business_key = p_business_key;
    if found then
        if v_operation.payment_id is not null
            or v_operation.operation_type is distinct from p_operation_type
            or v_operation.request is distinct from p_request then
            raise exception 'conflict: account financial operation replay mismatch';
        end if;
        return to_jsonb(v_operation);
    end if;

    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, request
    ) values (
        null, p_business_key, p_operation_type, p_request
    ) returning * into v_operation;

    return to_jsonb(v_operation);
end;
$$;

create or replace function stripe_connect.reserve_platform_financial_operation(
    p_business_key text,
    p_operation_type text,
    p_request jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_operation stripe_connect.financial_operations%rowtype;
begin
    if p_business_key is null or length(btrim(p_business_key)) = 0 then
        raise exception 'validation: business key is required';
    end if;
    if p_operation_type <> 'payout_schedule_update' then
        raise exception 'validation: unsupported platform financial operation';
    end if;
    if p_request is null or jsonb_typeof(p_request) <> 'object' then
        raise exception 'validation: operation request must be an object';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:platform_payout_control', 0)
    );
    select * into v_operation
    from stripe_connect.financial_operations
    where business_key = p_business_key;
    if found then
        if v_operation.payment_id is not null
            or v_operation.operation_type is distinct from p_operation_type
            or v_operation.request is distinct from p_request then
            raise exception 'conflict: platform financial operation replay mismatch';
        end if;
        return to_jsonb(v_operation);
    end if;

    insert into stripe_connect.financial_operations (
        payment_id, business_key, operation_type, request
    ) values (
        null, p_business_key, p_operation_type, p_request
    ) returning * into v_operation;
    return to_jsonb(v_operation);
end;
$$;

drop function if exists stripe_connect.claim_platform_payout_protection(text, bigint);
create or replace function stripe_connect.claim_platform_payout_protection(
    p_owner text,
    p_required_minimum_amount bigint,
    p_liability_revision bigint,
    p_decrease_authorization_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control stripe_connect.platform_payout_controls%rowtype;
    v_claimed boolean := false;
begin
    if p_owner is null or length(btrim(p_owner)) = 0
        or p_required_minimum_amount is null
        or p_required_minimum_amount < 0
        or p_required_minimum_amount > 9007199254740991
        or p_liability_revision is null
        or p_liability_revision < 0
        or p_liability_revision > 9007199254740991
    then
        raise exception 'validation: invalid platform payout protection claim';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:platform_payout_control', 0)
    );
    select * into v_control
    from stripe_connect.platform_payout_controls
    where control_key = 'default'
    for update;
    if not found then
        raise exception 'configuration: platform payout control is unavailable';
    end if;

    if p_liability_revision < v_control.liability_revision then
        raise exception 'conflict: stale Commerce platform payout liability revision';
    end if;
    if p_liability_revision = v_control.liability_revision
        and p_required_minimum_amount is distinct from v_control.required_minimum_amount then
        raise exception 'conflict: Commerce platform payout liability revision changed amount';
    end if;
    if p_liability_revision > v_control.liability_revision then
        update stripe_connect.platform_payout_controls
        set required_minimum_amount = p_required_minimum_amount,
            liability_revision = p_liability_revision,
            decrease_authorization_id = case
                when p_required_minimum_amount < provider_minimum_amount
                    then p_decrease_authorization_id
                else null end,
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
    elsif p_required_minimum_amount < v_control.provider_minimum_amount
    then
        if v_control.decrease_authorization_id is null
            and p_decrease_authorization_id is not null then
            update stripe_connect.platform_payout_controls
            set decrease_authorization_id = p_decrease_authorization_id,
                updated_at = now()
            where control_key = 'default'
            returning * into v_control;
        elsif v_control.decrease_authorization_id is distinct from p_decrease_authorization_id then
            raise exception 'forbidden: exact Admin decrease authorization does not match Commerce authority';
        end if;
    end if;

    if v_control.claim_owner is null
        or v_control.claim_owner = p_owner
        or v_control.claimed_at < now() - interval '15 minutes'
    then
        update stripe_connect.platform_payout_controls
        set claim_owner = p_owner,
            claimed_at = now(),
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        v_claimed := true;
    end if;

    return jsonb_build_object('claimed', v_claimed, 'control', to_jsonb(v_control));
end;
$$;

create or replace function stripe_connect.complete_platform_payout_protection(
    p_owner text,
    p_expected_liability_revision bigint,
    p_applied_minimum_amount bigint,
    p_succeeded boolean,
    p_error text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_control stripe_connect.platform_payout_controls%rowtype;
    v_needs_reapply boolean := false;
begin
    if p_owner is null or length(btrim(p_owner)) = 0
        or p_expected_liability_revision is null
        or p_expected_liability_revision < 0
        or p_applied_minimum_amount is null
        or p_applied_minimum_amount < 0
        or p_applied_minimum_amount > 9007199254740991
        or p_succeeded is null
    then
        raise exception 'validation: invalid platform payout protection completion';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:platform_payout_control', 0)
    );
    select * into v_control
    from stripe_connect.platform_payout_controls
    where control_key = 'default'
    for update;
    if not found then
        raise exception 'configuration: platform payout control is unavailable';
    end if;
    if v_control.claim_owner is distinct from p_owner then
        return jsonb_build_object(
            'accepted', false,
            'needsReapply', false,
            'control', to_jsonb(v_control)
        );
    end if;

    if not p_succeeded then
        update stripe_connect.platform_payout_controls
        set claim_owner = null,
            claimed_at = null,
            last_error = nullif(btrim(coalesce(p_error, '')), ''),
            updated_at = now()
        where control_key = 'default'
        returning * into v_control;
        return jsonb_build_object(
            'accepted', true,
            'needsReapply', false,
            'revisionChanged', v_control.liability_revision <> p_expected_liability_revision,
            'control', to_jsonb(v_control)
        );
    end if;

    v_needs_reapply := p_applied_minimum_amount < v_control.required_minimum_amount
        or (v_control.decrease_authorization_id is not null
            and p_applied_minimum_amount is distinct from v_control.required_minimum_amount);
    update stripe_connect.platform_payout_controls
    set provider_minimum_amount = p_applied_minimum_amount,
        decrease_authorization_id = case when v_needs_reapply
            then decrease_authorization_id else null end,
        claim_owner = case when v_needs_reapply then p_owner else null end,
        claimed_at = case when v_needs_reapply then now() else null end,
        last_error = null,
        last_provider_sync_at = now(),
        updated_at = now()
    where control_key = 'default'
    returning * into v_control;

    return jsonb_build_object(
        'accepted', true,
        'needsReapply', v_needs_reapply,
        'revisionChanged', v_control.liability_revision <> p_expected_liability_revision,
        'control', to_jsonb(v_control)
    );
end;
$$;

create or replace function stripe_connect.authorize_irreversible_dispute_action(
    p_action_key text,
    p_action_type text,
    p_dispute_id bigint,
    p_amount bigint,
    p_threshold_amount bigint,
    p_actor_kind text,
    p_actor_id text,
    p_payload_sha256 text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_approval stripe_connect.irreversible_dispute_action_approvals%rowtype;
begin
    if p_actor_kind is distinct from 'admin' or nullif(btrim(p_actor_id), '') is null then
        raise exception 'forbidden: admin approval actor is required';
    end if;
    if p_action_type not in ('dispute_evidence_submit', 'dispute_accept') then
        raise exception 'validation: unsupported irreversible dispute action';
    end if;
    if p_amount <= 0 or p_threshold_amount < 0 then
        raise exception 'validation: invalid dispute approval amount or threshold';
    end if;
    if p_amount < p_threshold_amount then
        return jsonb_build_object(
            'approved', true, 'dualApprovalRequired', false,
            'approvalStatus', 'not_required', 'firstApprovedBy', p_actor_id
        );
    end if;
    insert into stripe_connect.irreversible_dispute_action_approvals (
        action_key, action_type, dispute_id, amount, threshold_amount,
        payload_sha256, first_actor_kind, first_actor_id
    ) values (
        p_action_key, p_action_type, p_dispute_id, p_amount, p_threshold_amount,
        p_payload_sha256, p_actor_kind, p_actor_id
    ) on conflict (action_key) do nothing;
    select * into v_approval
    from stripe_connect.irreversible_dispute_action_approvals
    where action_key = p_action_key for update;
    if found then
        if v_approval.action_type is distinct from p_action_type
            or v_approval.dispute_id is distinct from p_dispute_id
            or v_approval.amount is distinct from p_amount
            or v_approval.threshold_amount is distinct from p_threshold_amount
            or v_approval.payload_sha256 is distinct from p_payload_sha256 then
            raise exception 'conflict: irreversible dispute approval replay mismatch';
        end if;
        if v_approval.status = 'approved' then
            return to_jsonb(v_approval) || jsonb_build_object(
                'approved', true, 'dualApprovalRequired', true,
                'approvalStatus', 'approved', 'firstApprovedBy', v_approval.first_actor_id,
                'secondApprovedBy', v_approval.second_actor_id
            );
        end if;
        if v_approval.first_actor_id = p_actor_id then
            return to_jsonb(v_approval) || jsonb_build_object(
                'approved', false, 'dualApprovalRequired', true,
                'approvalStatus', 'pending_second_approval', 'firstApprovedBy', v_approval.first_actor_id
            );
        end if;
        update stripe_connect.irreversible_dispute_action_approvals set
            status = 'approved', second_actor_kind = p_actor_kind,
            second_actor_id = p_actor_id, second_approved_at = now()
        where id = v_approval.id returning * into v_approval;
        return to_jsonb(v_approval) || jsonb_build_object(
            'approved', true, 'dualApprovalRequired', true,
            'approvalStatus', 'approved', 'firstApprovedBy', v_approval.first_actor_id,
            'secondApprovedBy', v_approval.second_actor_id
        );
    end if;
    raise exception 'conflict: irreversible dispute approval could not be reserved';
end;
$$;

create or replace function stripe_connect.claim_stripe_events(p_limit integer default 50)
returns setof stripe_connect.stripe_events
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select event.id
        from stripe_connect.stripe_events as event
        where (
                event.processing_status in ('pending', 'failed')
                or (
                    event.processing_status = 'processing'
                    and event.processing_started_at <= now() - interval '5 minutes'
                )
            )
          and event.attempt_count < 5
        order by event.received_at asc
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.stripe_events as event
    set processing_status = 'processing',
        processing_started_at = now(),
        attempt_count = event.attempt_count + 1,
        last_error = null
    from candidates
    where event.id = candidates.id
    returning event.*;
end;
$$;

create or replace function stripe_connect.claim_financial_operations(p_limit integer default 50)
returns setof stripe_connect.financial_operations
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select operation.id
        from stripe_connect.financial_operations as operation
        where operation.operation_type in (
                'payment_intent_create', 'payment_intent_cancel', 'transfer_create',
                'transfer_reversal_create', 'refund_create', 'payout_schedule_update'
            )
          and operation.status in ('reserved', 'processing', 'failed')
          and operation.attempt_count < 5
          and operation.created_at <= now() - interval '1 minute'
          and (operation.next_attempt_at is null or operation.next_attempt_at <= now())
          and (
              operation.status <> 'processing'
              or operation.claimed_at is null
              or operation.claimed_at <= now() - interval '5 minutes'
          )
        order by operation.created_at asc
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.financial_operations as operation
    set status = 'processing',
        claimed_at = now(),
        attempt_count = operation.attempt_count + 1,
        last_error = null
    from candidates
    where operation.id = candidates.id
    returning operation.*;
end;
$$;

create or replace function stripe_connect.read_reconciliation_operations(
    p_limit integer default 50
)
returns table (
    operation jsonb,
    client_reference_id text,
    payment_currency text
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        pg_catalog.to_jsonb(selected_operation),
        payment.client_reference_id,
        payment.currency
    from (
        select operation.*
        from stripe_connect.financial_operations operation
        order by operation.updated_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) selected_operation
    left join stripe_connect.payments payment
        on payment.id = selected_operation.payment_id
    order by selected_operation.updated_at desc
$$;

revoke execute on function stripe_connect.read_reconciliation_operations(integer)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_reconciliation_operations(integer)
    to service_role;

create or replace function stripe_connect.read_payment_reconciliation_ledger(
    p_payment_id bigint
)
returns table (
    refunded_amount numeric,
    transferred_amount numeric,
    reversed_amount numeric,
    seller_recovery_amount numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
    with refund_totals as (
        select
            coalesce(pg_catalog.sum(refund.amount), 0) as refunded_amount,
            coalesce(
                pg_catalog.sum(refund.seller_entitlement_reduction_amount), 0
            ) as seller_recovery_amount
        from stripe_connect.refunds refund
        where refund.payment_id = p_payment_id
          and refund.status = 'succeeded'
    ),
    transfer_totals as (
        select coalesce(pg_catalog.sum(transfer.amount), 0) as transferred_amount
        from stripe_connect.transfers transfer
        where transfer.payment_id = p_payment_id
          and transfer.status in ('succeeded', 'partially_reversed', 'reversed')
    ),
    reversal_totals as (
        select coalesce(pg_catalog.sum(reversal.amount), 0) as reversed_amount
        from stripe_connect.transfer_reversals reversal
        where reversal.payment_id = p_payment_id
          and reversal.status = 'succeeded'
    )
    select
        refund_totals.refunded_amount,
        transfer_totals.transferred_amount,
        reversal_totals.reversed_amount,
        refund_totals.seller_recovery_amount
    from refund_totals
    cross join transfer_totals
    cross join reversal_totals
$$;

revoke execute on function stripe_connect.read_payment_reconciliation_ledger(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_payment_reconciliation_ledger(bigint)
    to service_role;

create or replace function stripe_connect.read_payment_reconciliation_local_context(
    p_payment_id bigint
)
returns table (
    payment jsonb,
    refunds jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        (
            select pg_catalog.to_jsonb(payment_row)
            from stripe_connect.payments payment_row
            where payment_row.id = p_payment_id
        ) as payment,
        coalesce((
            select pg_catalog.jsonb_agg(
                pg_catalog.to_jsonb(refund_row) order by refund_row.id
            )
            from stripe_connect.refunds refund_row
            where refund_row.payment_id = p_payment_id
        ), '[]'::jsonb) as refunds
$$;

revoke execute on function stripe_connect.read_payment_reconciliation_local_context(bigint)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_payment_reconciliation_local_context(bigint)
    to service_role;

create or replace function stripe_connect.read_provider_transfer_reconciliation_context(
    p_stripe_transfer_id text
)
returns table (
    transfer jsonb,
    local_reversed_amount numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        case
            when selected_transfer.id is null then null::jsonb
            else pg_catalog.to_jsonb(selected_transfer)
        end as transfer,
        coalesce(reversal_totals.local_reversed_amount, 0) as local_reversed_amount
    from (values (true)) singleton(present)
    left join lateral (
        select candidate.*
        from stripe_connect.transfers candidate
        where candidate.stripe_transfer_id = p_stripe_transfer_id
    ) selected_transfer on singleton.present
    left join lateral (
        select pg_catalog.sum(reversal.amount) as local_reversed_amount
        from stripe_connect.transfer_reversals reversal
        where reversal.transfer_id = selected_transfer.id
          and reversal.status = 'succeeded'
    ) reversal_totals on true
$$;

revoke execute on function stripe_connect.read_provider_transfer_reconciliation_context(text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_provider_transfer_reconciliation_context(text)
    to service_role;

create or replace function stripe_connect.read_financial_operation_recovery_context(
    p_payment_id bigint,
    p_operation_id bigint,
    p_recovery_request_id text
)
returns table (
    payment jsonb,
    transfer jsonb,
    transfer_reversal jsonb,
    transfer_recovery jsonb,
    refund jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
    select
        case when payment_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(payment_row) end as payment,
        case when transfer_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(transfer_row) end as transfer,
        case when reversal_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(reversal_row) end as transfer_reversal,
        case when recovery_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(recovery_row) end as transfer_recovery,
        case when refund_row.id is null then null::jsonb
            else pg_catalog.to_jsonb(refund_row) end as refund
    from (values (true)) singleton(present)
    left join stripe_connect.payments payment_row
        on payment_row.id = p_payment_id
    left join stripe_connect.transfers transfer_row
        on transfer_row.operation_id = p_operation_id
    left join stripe_connect.transfer_reversals reversal_row
        on reversal_row.operation_id = p_operation_id
    left join stripe_connect.transfer_recovery_requests recovery_row
        on recovery_row.recovery_request_id = p_recovery_request_id
    left join stripe_connect.refunds refund_row
        on refund_row.operation_id = p_operation_id
$$;

revoke execute on function stripe_connect.read_financial_operation_recovery_context(bigint, bigint, text)
    from public, anon, authenticated;
grant execute on function stripe_connect.read_financial_operation_recovery_context(bigint, bigint, text)
    to service_role;

create or replace function stripe_connect.claim_commerce_projection_outbox(
    p_owner text,
    p_limit integer default 50
)
returns setof stripe_connect.commerce_projection_outbox
language plpgsql
set search_path = ''
as $$
begin
    if nullif(btrim(p_owner), '') is null then
        raise exception 'validation: projection claim owner is required';
    end if;
    return query
    with candidates as (
        select projection.id
        from stripe_connect.commerce_projection_outbox projection
        where ((
                projection.projection_status in ('pending', 'retry')
                and (projection.next_attempt_at is null or projection.next_attempt_at <= now())
            ) or (
                projection.projection_status = 'leased'
                and projection.claimed_at <= now() - interval '5 minutes'
            ))
          and not (
              projection.projection_kind = 'refund'
              and projection.recovery_key is not null
              and exists (
                  select 1
                  from stripe_connect.commerce_projection_outbox predecessor
                  where predecessor.recovery_key = projection.recovery_key
                    and predecessor.projection_kind = 'reversal'
                    and predecessor.causal_sequence < projection.causal_sequence
                  and predecessor.projection_status <> 'succeeded'
              )
          )
          and not (
              projection.projection_kind = 'refund'
              and exists (
                  select 1
                  from stripe_connect.commerce_projection_outbox predecessor
                  where predecessor.operation_id = projection.operation_id
                    and predecessor.projection_kind = 'refund'
                    and predecessor.causal_sequence < projection.causal_sequence
                    and predecessor.projection_status <> 'succeeded'
              )
          )
        order by projection.created_at, projection.causal_sequence, projection.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
    )
    update stripe_connect.commerce_projection_outbox projection
    set projection_status = 'leased',
        claim_owner = p_owner,
        claim_token = pg_catalog.gen_random_uuid(),
        claimed_at = now(),
        attempt_count = projection.attempt_count + 1,
        last_error = null
    from candidates
    where projection.id = candidates.id
    returning projection.*;
end;
$$;

create or replace function stripe_connect.claim_reconciliation_projection_batch(
    p_owner text,
    p_limit integer default 50
)
returns table (
    projection jsonb,
    payment jsonb,
    financial_operation jsonb,
    operation_payment jsonb,
    dispute jsonb,
    dispute_client_reference_id text,
    staged_evidence jsonb,
    evidence_submission_count bigint,
    pending_approval jsonb
)
language sql
volatile
security invoker
set search_path = ''
set jit = off
as $$
    with claimed as materialized (
        select projection.*
        from stripe_connect.claim_commerce_projection_outbox(p_owner, p_limit) projection
    )
    select
        pg_catalog.to_jsonb(claimed),
        pg_catalog.to_jsonb(payment),
        pg_catalog.to_jsonb(financial_operation),
        pg_catalog.to_jsonb(operation_payment),
        pg_catalog.to_jsonb(dispute),
        dispute_payment.client_reference_id,
        evidence_context.value,
        coalesce(evidence_context.submission_count, 0),
        pending_approval.value
    from claimed
    left join stripe_connect.payments payment
        on payment.id = claimed.payment_id
    left join stripe_connect.financial_operations financial_operation
        on financial_operation.id = claimed.operation_id
    left join stripe_connect.payments operation_payment
        on operation_payment.id = financial_operation.payment_id
    left join stripe_connect.stripe_disputes dispute
        on dispute.id = case
            when claimed.provider_object_id ~ '^[1-9][0-9]{0,17}$'
                then claimed.provider_object_id::bigint
            when claimed.provider_object_id ~ '^[1-9][0-9]{18}$'
                and claimed.provider_object_id collate "C"
                    <= '9223372036854775807' collate "C"
                then claimed.provider_object_id::bigint
            else null
        end
       and claimed.projection_kind = 'dispute'
    left join stripe_connect.payments dispute_payment
        on dispute_payment.id = dispute.payment_id
    left join lateral (
        select pg_catalog.jsonb_build_object(
            'evidence_operation_id', evidence.evidence_operation_id,
            'staged_at', evidence.staged_at,
            'submitted_at', evidence.submitted_at
        ) value,
        pg_catalog.count(*) filter (
            where evidence.submitted_at is not null
        ) over ()::bigint submission_count
        from stripe_connect.stripe_dispute_evidence evidence
        where evidence.dispute_id = dispute.id
        order by evidence.staged_at desc
        limit 1
    ) evidence_context on true
    left join lateral (
        select pg_catalog.jsonb_build_object(
            'action_type', approval.action_type,
            'status', approval.status,
            'first_actor_id', approval.first_actor_id,
            'first_approved_at', approval.first_approved_at,
            'second_actor_id', approval.second_actor_id,
            'second_approved_at', approval.second_approved_at
        ) value
        from stripe_connect.irreversible_dispute_action_approvals approval
        where approval.dispute_id = dispute.id
          and approval.status = 'pending_second_approval'
        order by approval.created_at desc
        limit 1
    ) pending_approval on true
    order by claimed.created_at, claimed.causal_sequence, claimed.id
$$;

revoke execute on function stripe_connect.claim_reconciliation_projection_batch(text, integer)
    from public, anon, authenticated;
grant execute on function stripe_connect.claim_reconciliation_projection_batch(text, integer)
    to service_role;

create or replace function stripe_connect.ack_commerce_projection_outbox(
    p_projection_id bigint,
    p_claim_token uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    update stripe_connect.commerce_projection_outbox
    set projection_status = 'succeeded', projected_at = now(),
        claim_owner = null, claim_token = null, claimed_at = null,
        next_attempt_at = null, last_error = null
    where id = p_projection_id
      and projection_status = 'leased'
      and claim_token = p_claim_token
    returning * into v_projection;
    if not found then raise exception 'conflict: projection lease is no longer valid'; end if;
    update stripe_connect.provider_exceptions
    set status = 'resolved', resolved_at = now(), resolved_by = 'commerce-projection-ack'
    where deduplication_key = 'commerce-projection:' || v_projection.id
      and status <> 'resolved';
    return to_jsonb(v_projection);
end;
$$;

create or replace function stripe_connect.fail_commerce_projection_outbox(
    p_projection_id bigint,
    p_claim_token uuid,
    p_error text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_projection stripe_connect.commerce_projection_outbox%rowtype;
begin
    if nullif(btrim(p_error), '') is null then
        raise exception 'validation: projection failure reason is required';
    end if;
    update stripe_connect.commerce_projection_outbox
    set projection_status = case when attempt_count >= 5 then 'manual_review' else 'retry' end,
        next_attempt_at = case when attempt_count >= 5 then null
            else now() + make_interval(secs => least(300, pg_catalog.power(2, attempt_count)::integer)) end,
        claim_owner = null, claim_token = null, claimed_at = null,
        last_error = left(p_error, 2000)
    where id = p_projection_id
      and projection_status = 'leased'
      and claim_token = p_claim_token
    returning * into v_projection;
    if not found then raise exception 'conflict: projection lease is no longer valid'; end if;
    if v_projection.projection_status = 'manual_review' then
        insert into stripe_connect.provider_exceptions (
            deduplication_key, payment_id, operation_id, exception_type,
            severity, status, message, details
        ) values (
            'commerce-projection:' || v_projection.id,
            v_projection.payment_id,
            v_projection.operation_id,
            'commerce_projection_delivery_failed',
            'critical', 'open',
            'Commerce projection exhausted automatic delivery retries',
            jsonb_build_object(
                'projectionId', v_projection.id,
                'projectionKey', v_projection.projection_key,
                'projectionKind', v_projection.projection_kind,
                'attemptCount', v_projection.attempt_count,
                'interventionRevision', v_projection.intervention_revision,
                'lastError', v_projection.last_error
            )
        ) on conflict (deduplication_key) where deduplication_key is not null do update
        set status = 'open', resolved_at = null, resolved_by = null,
            message = excluded.message, details = excluded.details,
            operation_id = excluded.operation_id, payment_id = excluded.payment_id;
    end if;
    return to_jsonb(v_projection);
end;
$$;

create or replace function stripe_connect.requeue_commerce_projection_outbox(
    p_projection_id bigint,
    p_expected_intervention_revision bigint,
    p_actor_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_projection stripe_connect.commerce_projection_outbox%rowtype;
    v_previous_status text;
begin
    if p_projection_id is null or p_projection_id <= 0
        or p_expected_intervention_revision is null or p_expected_intervention_revision < 0
        or nullif(btrim(p_actor_id), '') is null
        or nullif(btrim(p_reason), '') is null
    then
        raise exception 'validation: invalid Commerce projection intervention';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('stripe_connect:commerce_projection:' || p_projection_id, 0)
    );
    select * into v_projection
    from stripe_connect.commerce_projection_outbox
    where id = p_projection_id
    for update;
    if not found then raise exception 'not_found: Commerce projection'; end if;
    if v_projection.intervention_revision is distinct from p_expected_intervention_revision then
        raise exception 'conflict: stale Commerce projection intervention revision';
    end if;
    if v_projection.projection_status <> 'manual_review' then
        raise exception 'conflict: Commerce projection is not awaiting Finance intervention';
    end if;
    v_previous_status := v_projection.projection_status;
    update stripe_connect.commerce_projection_outbox
    set projection_status = 'retry',
        attempt_count = 0,
        next_attempt_at = now(),
        claim_owner = null,
        claim_token = null,
        claimed_at = null,
        intervention_revision = intervention_revision + 1,
        last_intervention_at = now(),
        last_intervention_by = p_actor_id,
        last_intervention_reason = left(p_reason, 2000)
    where id = p_projection_id
    returning * into v_projection;
    insert into stripe_connect.commerce_projection_interventions (
        projection_id, intervention_revision, action, actor_id, reason,
        previous_status, next_status
    ) values (
        v_projection.id, v_projection.intervention_revision, 'requeue',
        p_actor_id, left(p_reason, 2000), v_previous_status, v_projection.projection_status
    );
    return to_jsonb(v_projection);
end;
$$;

create or replace function stripe_connect.mark_payment_manual_review(
    p_payment_id bigint,
    p_reason text,
    p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_payment stripe_connect.payments%rowtype; v_previous text;
begin
    if p_reason is null or length(btrim(p_reason)) = 0 then
        raise exception 'validation: manual review reason is required';
    end if;
    select * into v_payment from stripe_connect.payments where id = p_payment_id for update;
    if not found then raise exception 'not_found: payment'; end if;
    v_previous := v_payment.settlement_status;
    update stripe_connect.payments
    set settlement_status = 'manual_review', manual_review_reason = p_reason
    where id = p_payment_id returning * into v_payment;
    insert into stripe_connect.payment_events (
        payment_id, event_type, actor_kind, actor_id,
        previous_settlement_status, next_settlement_status, data
    ) values (
        p_payment_id, 'manual_review_required', 'system', 'stripe-connect',
        v_previous, 'manual_review', coalesce(p_details, '{}'::jsonb)
    );
    return to_jsonb(v_payment);
end;
$$;

create or replace function stripe_connect.recover_transient_provider_truth_review(
    p_payment_id bigint,
    p_payment_intent_id text,
    p_charge_id text,
    p_balance_transaction_id text,
    p_actor_kind text,
    p_actor_id text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_reason constant text := 'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
    v_exception_key text;
begin
    if p_actor_kind not in ('system', 'webhook', 'reconciliation') then
        raise exception 'validation: invalid provider truth recovery actor kind';
    end if;
    if p_actor_id is null or length(btrim(p_actor_id)) = 0 then
        raise exception 'validation: provider truth recovery actor id is required';
    end if;

    select * into v_payment
    from stripe_connect.payments
    where id = p_payment_id
    for update;
    if not found then raise exception 'not_found: payment'; end if;

    v_exception_key := 'provider-payment-truth:' || p_payment_id || ':' || p_payment_intent_id;
    if v_payment.payment_status <> 'succeeded'
        or v_payment.settlement_status <> 'manual_review'
        or v_payment.manual_review_reason is distinct from v_reason
        or v_payment.stripe_payment_intent_id is distinct from p_payment_intent_id
        or v_payment.stripe_charge_id is distinct from p_charge_id
        or v_payment.stripe_charge_balance_transaction_id is distinct from p_balance_transaction_id
        or v_payment.transferred_amount <> 0
        or v_payment.reversed_amount <> 0
        or v_payment.refunded_amount <> 0
        or v_payment.dispute_status <> 'none'
        or not exists (
            select 1
            from stripe_connect.provider_exceptions exception
            where exception.payment_id = p_payment_id
              and exception.status in ('open', 'investigating')
              and exception.deduplication_key = v_exception_key
        )
        or exists (
            select 1
            from stripe_connect.provider_exceptions exception
            where exception.payment_id = p_payment_id
              and exception.status in ('open', 'investigating')
              and exception.deduplication_key is distinct from v_exception_key
        )
    then
        return jsonb_build_object('recovered', false, 'payment', to_jsonb(v_payment));
    end if;

    update stripe_connect.payments
    set settlement_status = 'held', manual_review_reason = null
    where id = p_payment_id
    returning * into v_payment;

    update stripe_connect.provider_exceptions
    set status = 'resolved', resolved_at = now(), resolved_by = 'provider-truth-revalidation'
    where deduplication_key = v_exception_key
      and status in ('open', 'investigating');

    insert into stripe_connect.payment_events (
        payment_id, event_type, actor_kind, actor_id,
        previous_payment_status, next_payment_status,
        previous_settlement_status, next_settlement_status, data
    ) values (
        p_payment_id, 'provider_payment_truth_revalidated', p_actor_kind, p_actor_id,
        'succeeded', 'succeeded', 'manual_review', 'held',
        jsonb_build_object(
            'resolvedReason', v_reason,
            'paymentIntentId', p_payment_intent_id,
            'chargeId', p_charge_id,
            'balanceTransactionId', p_balance_transaction_id
        )
    );

    return jsonb_build_object('recovered', true, 'payment', to_jsonb(v_payment));
end;
$$;

create or replace function stripe_connect.apply_payment_provider_projection(
    p_payment_id bigint,
    p_expected_payment jsonb,
    p_projection jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_payment stripe_connect.payments%rowtype;
    v_expected_payment stripe_connect.payments%rowtype;
    v_payment_json jsonb;
    v_kind text;
    v_payment_status text;
    v_payment_intent_id text;
    v_charge_id text;
    v_balance_transaction_id text;
    v_charge_fee_amount bigint;
    v_processing_fee_amount bigint;
    v_charge_net_amount bigint;
    v_fee_currency text;
    v_fee_details jsonb;
    v_paid_at timestamptz;
    v_cancelled_at timestamptz;
    v_provider_synced_at timestamptz;
    v_projection_key text;
    v_recovered_projection_key text;
    v_projection_key_pattern text;
    v_recovery jsonb;
    v_recovery_result jsonb;
    v_recovered boolean := false;
    v_was_transient_review boolean;
    v_exception_key text;
    v_actor_kind text;
    v_actor_id text;
    v_details jsonb;
    v_mismatches text[];
    v_manual_review_reason text;
    v_provider_payment_intent_id text;
    v_apply_mutable_fields constant text[] := array[
        'payment_status', 'stripe_payment_intent_id', 'stripe_charge_id',
        'stripe_charge_balance_transaction_id', 'actual_stripe_charge_fee_amount',
        'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
        'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details',
        'paid_at', 'cancelled_at', 'last_provider_sync_at', 'updated_at'
    ];
begin
    if p_payment_id is null or p_payment_id <= 0 then
        raise exception 'validation: payment id must be positive';
    end if;
    if p_expected_payment is null or jsonb_typeof(p_expected_payment) <> 'object'
        or not p_expected_payment ?& array[
            'id', 'client_reference_id', 'financial_terms_hash', 'financial_revision',
            'dual_approval_threshold_amount', 'buyer_cms_user_id', 'seller_cms_user_id',
            'seller_stripe_account_id', 'stripe_payment_intent_id', 'stripe_charge_id',
            'stripe_charge_balance_transaction_id', 'last_stripe_event_id', 'transfer_group',
            'currency', 'amount_total', 'seller_transfer_amount', 'platform_retained_amount',
            'refunded_amount', 'transferred_amount', 'reversed_amount',
            'actual_stripe_charge_fee_amount', 'actual_stripe_refund_fee_amount',
            'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
            'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details', 'payment_status',
            'settlement_status', 'dispute_status', 'description', 'manual_review_reason',
            'paid_at', 'cancelled_at', 'last_provider_sync_at', 'created_at', 'updated_at'
        ]
        or exists (
            select 1
            from jsonb_object_keys(p_expected_payment) as expected_field(key)
            where expected_field.key not in (
                'id', 'client_reference_id', 'financial_terms_hash', 'financial_revision',
                'dual_approval_threshold_amount', 'buyer_cms_user_id', 'seller_cms_user_id',
                'seller_stripe_account_id', 'stripe_payment_intent_id', 'stripe_charge_id',
                'stripe_charge_balance_transaction_id', 'last_stripe_event_id', 'transfer_group',
                'currency', 'amount_total', 'seller_transfer_amount', 'platform_retained_amount',
                'refunded_amount', 'transferred_amount', 'reversed_amount',
                'actual_stripe_charge_fee_amount', 'actual_stripe_refund_fee_amount',
                'actual_stripe_processing_fee_amount', 'actual_stripe_charge_net_amount',
                'actual_stripe_fee_currency', 'actual_stripe_charge_fee_details', 'payment_status',
                'settlement_status', 'dispute_status', 'description', 'manual_review_reason',
                'paid_at', 'cancelled_at', 'last_provider_sync_at', 'created_at', 'updated_at'
            )
        )
    then
        raise exception 'validation: expected payment must be an exact payment projection';
    end if;
    begin
        select expected.* into v_expected_payment
        from jsonb_populate_record(
            null::stripe_connect.payments,
            p_expected_payment
        ) as expected;
    exception when others then
        raise exception 'validation: expected payment contains invalid values';
    end;
    if v_expected_payment.id is distinct from p_payment_id then
        raise exception 'validation: expected payment id does not match payment id';
    end if;

    if p_projection is null or jsonb_typeof(p_projection) <> 'object' then
        raise exception 'validation: payment provider projection must be an object';
    end if;
    v_kind := p_projection->>'kind';
    if v_kind is null or v_kind not in ('apply', 'quarantine') then
        raise exception 'validation: invalid payment provider projection kind';
    end if;

    if v_kind = 'apply' then
        if not p_projection ?& array[
                'kind', 'paymentStatus', 'stripePaymentIntentId', 'stripeChargeId',
                'stripeChargeBalanceTransactionId', 'actualStripeChargeFeeAmount',
                'actualStripeProcessingFeeAmount', 'actualStripeChargeNetAmount',
                'actualStripeFeeCurrency', 'actualStripeChargeFeeDetails', 'paidAt',
                'cancelledAt', 'lastProviderSyncAt', 'projectionKey',
                'recoveredProjectionKey', 'recovery'
            ]
            or exists (
                select 1
                from jsonb_object_keys(p_projection) as projection_field(key)
                where projection_field.key not in (
                    'kind', 'paymentStatus', 'stripePaymentIntentId', 'stripeChargeId',
                    'stripeChargeBalanceTransactionId', 'actualStripeChargeFeeAmount',
                    'actualStripeProcessingFeeAmount', 'actualStripeChargeNetAmount',
                    'actualStripeFeeCurrency', 'actualStripeChargeFeeDetails', 'paidAt',
                    'cancelledAt', 'lastProviderSyncAt', 'projectionKey',
                    'recoveredProjectionKey', 'recovery'
                )
            )
        then
            raise exception 'validation: invalid apply payment provider projection fields';
        end if;

        v_payment_status := p_projection->>'paymentStatus';
        v_payment_intent_id := p_projection->>'stripePaymentIntentId';
        v_charge_id := p_projection->>'stripeChargeId';
        v_balance_transaction_id := p_projection->>'stripeChargeBalanceTransactionId';
        v_fee_currency := p_projection->>'actualStripeFeeCurrency';
        v_fee_details := p_projection->'actualStripeChargeFeeDetails';
        v_projection_key := nullif(btrim(p_projection->>'projectionKey'), '');
        v_recovered_projection_key := nullif(btrim(p_projection->>'recoveredProjectionKey'), '');
        v_recovery := p_projection->'recovery';

        if v_payment_status is null
            or v_payment_status not in ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled')
            or v_payment_intent_id is null or v_payment_intent_id not like 'pi_%'
            or (v_charge_id is not null and v_charge_id not like 'ch_%')
            or (v_balance_transaction_id is not null and v_balance_transaction_id not like 'txn_%')
            or (v_fee_currency is not null and v_fee_currency <> 'eur')
            or jsonb_typeof(v_fee_details) <> 'array'
            or jsonb_typeof(p_projection->'actualStripeChargeFeeAmount') <> 'number'
            or (p_projection->>'actualStripeChargeFeeAmount') !~ '^[0-9]+$'
            or jsonb_typeof(p_projection->'actualStripeProcessingFeeAmount') <> 'number'
            or (p_projection->>'actualStripeProcessingFeeAmount') !~ '^-?[0-9]+$'
            or jsonb_typeof(p_projection->'actualStripeChargeNetAmount') not in ('number', 'null')
            or (jsonb_typeof(p_projection->'actualStripeChargeNetAmount') = 'number'
                and (p_projection->>'actualStripeChargeNetAmount') !~ '^-?[0-9]+$')
            or jsonb_typeof(p_projection->'paidAt') not in ('string', 'null')
            or jsonb_typeof(p_projection->'cancelledAt') not in ('string', 'null')
            or jsonb_typeof(p_projection->'lastProviderSyncAt') <> 'string'
            or jsonb_typeof(p_projection->'recoveredProjectionKey') not in ('string', 'null')
            or jsonb_typeof(v_recovery) not in ('object', 'null')
            or v_projection_key is null
        then
            raise exception 'validation: invalid apply payment provider projection';
        end if;
        begin
            v_charge_fee_amount := (p_projection->>'actualStripeChargeFeeAmount')::bigint;
            v_processing_fee_amount := (p_projection->>'actualStripeProcessingFeeAmount')::bigint;
            v_charge_net_amount := (p_projection->>'actualStripeChargeNetAmount')::bigint;
            v_paid_at := (p_projection->>'paidAt')::timestamptz;
            v_cancelled_at := (p_projection->>'cancelledAt')::timestamptz;
            v_provider_synced_at := (p_projection->>'lastProviderSyncAt')::timestamptz;
        exception when others then
            raise exception 'validation: apply payment provider projection contains invalid values';
        end;
        if v_charge_fee_amount not between 0 and 9007199254740991
            or v_processing_fee_amount not between -9007199254740991 and 9007199254740991
            or (v_charge_net_amount is not null
                and v_charge_net_amount not between -9007199254740991 and 9007199254740991)
            or v_provider_synced_at is null
        then
            raise exception 'validation: apply payment provider projection values are out of range';
        end if;

        v_projection_key_pattern := '^payment:' || p_payment_id
            || ':.+:' || v_payment_status
            || ':' || coalesce(v_charge_id, 'none') || ':[0-9a-f]{64}$';
        if v_projection_key !~ v_projection_key_pattern
            or (v_recovered_projection_key is not null
                and v_recovered_projection_key !~ v_projection_key_pattern)
        then
            raise exception 'validation: invalid payment provider projection key';
        end if;

        if jsonb_typeof(v_recovery) = 'object' then
            if not v_recovery ?& array[
                    'exceptionKey', 'paymentIntentId', 'chargeId',
                    'balanceTransactionId', 'actorKind', 'actorId'
                ]
                or exists (
                    select 1
                    from jsonb_object_keys(v_recovery) as recovery_field(key)
                    where recovery_field.key not in (
                        'exceptionKey', 'paymentIntentId', 'chargeId',
                        'balanceTransactionId', 'actorKind', 'actorId'
                    )
                )
            then
                raise exception 'validation: invalid provider truth recovery fields';
            end if;
            v_exception_key := nullif(btrim(v_recovery->>'exceptionKey'), '');
            v_actor_kind := v_recovery->>'actorKind';
            v_actor_id := nullif(btrim(v_recovery->>'actorId'), '');
            if v_exception_key is distinct from (
                    'provider-payment-truth:' || p_payment_id || ':' || v_payment_intent_id
                )
                or v_recovery->>'paymentIntentId' is distinct from v_payment_intent_id
                or v_recovery->>'chargeId' is distinct from v_charge_id
                or v_recovery->>'balanceTransactionId' is distinct from v_balance_transaction_id
                or v_actor_kind is null
                or v_actor_kind not in ('system', 'webhook', 'reconciliation')
                or v_actor_id is null
                or v_recovered_projection_key is null
            then
                raise exception 'validation: invalid provider truth recovery';
            end if;
        elsif v_recovered_projection_key is not null then
            raise exception 'validation: recovered projection key requires provider truth recovery';
        end if;
    else
        if not p_projection ?& array[
                'kind', 'paymentStatus', 'settlementStatus', 'manualReviewReason',
                'stripePaymentIntentId', 'stripeChargeId', 'paidAt',
                'lastProviderSyncAt', 'projectionKey', 'exceptionKey',
                'actorKind', 'actorId', 'details'
            ]
            or exists (
                select 1
                from jsonb_object_keys(p_projection) as projection_field(key)
                where projection_field.key not in (
                    'kind', 'paymentStatus', 'settlementStatus', 'manualReviewReason',
                    'stripePaymentIntentId', 'stripeChargeId', 'paidAt',
                    'lastProviderSyncAt', 'projectionKey', 'exceptionKey',
                    'actorKind', 'actorId', 'details'
                )
            )
        then
            raise exception 'validation: invalid quarantine payment provider projection fields';
        end if;

        v_payment_status := p_projection->>'paymentStatus';
        v_payment_intent_id := p_projection->>'stripePaymentIntentId';
        v_charge_id := p_projection->>'stripeChargeId';
        v_projection_key := nullif(btrim(p_projection->>'projectionKey'), '');
        v_exception_key := nullif(btrim(p_projection->>'exceptionKey'), '');
        v_actor_kind := p_projection->>'actorKind';
        v_actor_id := nullif(btrim(p_projection->>'actorId'), '');
        v_details := p_projection->'details';
        v_manual_review_reason := nullif(btrim(p_projection->>'manualReviewReason'), '');

        if v_payment_status is distinct from 'failed'
            or p_projection->>'settlementStatus' is distinct from 'manual_review'
            or jsonb_typeof(p_projection->'paidAt') <> 'null'
            or jsonb_typeof(p_projection->'lastProviderSyncAt') <> 'string'
            or (v_payment_intent_id is not null and v_payment_intent_id not like 'pi_%')
            or (v_charge_id is not null and v_charge_id not like 'ch_%')
            or v_manual_review_reason is null or length(v_manual_review_reason) > 2000
            or v_projection_key is null or v_exception_key is null
            or v_actor_kind is null
            or v_actor_kind not in ('system', 'webhook', 'reconciliation')
            or v_actor_id is null
            or jsonb_typeof(v_details) <> 'object'
            or not v_details ?& array['paymentIntentId', 'chargeId', 'mismatches']
            or exists (
                select 1
                from jsonb_object_keys(v_details) as detail_field(key)
                where detail_field.key not in ('paymentIntentId', 'chargeId', 'mismatches')
            )
            or nullif(btrim(v_details->>'paymentIntentId'), '') is null
            or (v_details->>'paymentIntentId' <> 'missing'
                and v_details->>'paymentIntentId' not like 'pi_%')
            or (v_details->>'chargeId' is not null and v_details->>'chargeId' not like 'ch_%')
            or jsonb_typeof(v_details->'mismatches') <> 'array'
            or jsonb_array_length(v_details->'mismatches') not between 1 and 32
            or exists (
                select 1
                from jsonb_array_elements(v_details->'mismatches') as mismatch(value)
                where jsonb_typeof(mismatch.value) <> 'string'
                    or nullif(btrim(mismatch.value #>> '{}'), '') is null
                    or length(mismatch.value #>> '{}') > 200
            )
        then
            raise exception 'validation: invalid quarantine payment provider projection';
        end if;
        begin
            v_provider_synced_at := (p_projection->>'lastProviderSyncAt')::timestamptz;
        exception when others then
            raise exception 'validation: quarantine payment provider projection contains invalid values';
        end;
        if v_provider_synced_at is null then
            raise exception 'validation: quarantine provider sync timestamp is required';
        end if;
        select array_agg(mismatch.value #>> '{}' order by mismatch.ordinality)
        into v_mismatches
        from jsonb_array_elements(v_details->'mismatches') with ordinality as mismatch(value, ordinality);
        if v_manual_review_reason is distinct from (
            'Stripe payment provider truth mismatch: ' || array_to_string(v_mismatches, ', ')
        ) then
            raise exception 'validation: quarantine reason does not match provider truth mismatches';
        end if;
        v_provider_payment_intent_id := v_details->>'paymentIntentId';
        if v_exception_key is distinct from (
                'provider-payment-truth:' || p_payment_id || ':' || v_provider_payment_intent_id
            )
        then
            raise exception 'validation: invalid provider truth exception key';
        end if;
        v_projection_key_pattern := 'payment:' || p_payment_id || ':' || v_actor_id || ':quarantine:';
        if left(v_projection_key, length(v_projection_key_pattern)) <> v_projection_key_pattern
            or substring(v_projection_key from length(v_projection_key_pattern) + 1) !~ '^[0-9a-f]{64}$'
        then
            raise exception 'validation: invalid quarantine projection key';
        end if;
    end if;

    select * into v_payment
    from stripe_connect.payments
    where id = p_payment_id
    for no key update;
    if not found then
        raise exception 'not_found: payment';
    end if;
    if v_payment is distinct from v_expected_payment then
        if v_kind <> 'apply'
            or jsonb_typeof(v_recovery) <> 'null'
            or v_recovered_projection_key is not null
            or (to_jsonb(v_payment) - v_apply_mutable_fields)
                is distinct from (to_jsonb(v_expected_payment) - v_apply_mutable_fields)
            or v_payment.payment_status is distinct from v_payment_status
            or v_payment.stripe_payment_intent_id is distinct from v_payment_intent_id
            or v_payment.stripe_charge_id is distinct from v_charge_id
            or v_payment.stripe_charge_balance_transaction_id is distinct from v_balance_transaction_id
            or v_payment.actual_stripe_charge_fee_amount is distinct from v_charge_fee_amount
            or v_payment.actual_stripe_processing_fee_amount is distinct from v_processing_fee_amount
            or v_payment.actual_stripe_charge_net_amount is distinct from v_charge_net_amount
            or v_payment.actual_stripe_fee_currency is distinct from v_fee_currency
            or v_payment.actual_stripe_charge_fee_details is distinct from v_fee_details
            or not (
                (v_payment.paid_at is not distinct from v_paid_at
                    and v_payment.paid_at is not distinct from v_expected_payment.paid_at)
                or (v_payment_status = 'succeeded'
                    and v_expected_payment.paid_at is null
                    and v_payment.paid_at is not null
                    and v_paid_at is not null)
            )
            or not (
                (v_payment.cancelled_at is not distinct from v_cancelled_at
                    and v_payment.cancelled_at is not distinct from v_expected_payment.cancelled_at)
                or (v_payment_status = 'cancelled'
                    and v_expected_payment.cancelled_at is null
                    and v_payment.cancelled_at is not null
                    and v_cancelled_at is not null)
            )
            or not exists (
                select 1
                from stripe_connect.commerce_projection_outbox projection
                where projection.payment_id = p_payment_id
                  and projection.projection_key = v_projection_key
                  and projection.projection_kind = 'payment'
                  and projection.provider_object_id = p_payment_id::text
                  and projection.operation_id is null
                  and projection.recovery_key is null
                  and projection.causal_sequence = 0
            )
        then
            return jsonb_build_object('applied', false, 'payment', to_jsonb(v_payment));
        end if;

        update stripe_connect.payments
        set last_provider_sync_at = greatest(
                v_payment.last_provider_sync_at,
                v_provider_synced_at
            )
        where id = p_payment_id
        returning * into v_payment;
        perform stripe_connect.enqueue_commerce_provider_projection(
            p_payment_id,
            v_projection_key,
            'payment',
            p_payment_id::text
        );
        return jsonb_build_object('applied', true, 'payment', to_jsonb(v_payment));
    end if;

    if v_kind = 'apply' then
        if v_processing_fee_amount is distinct from (
                v_charge_fee_amount + v_payment.actual_stripe_refund_fee_amount
            )
        then
            raise exception 'validation: Stripe processing fee projection is inconsistent';
        end if;
        v_was_transient_review := v_payment.settlement_status = 'manual_review'
            and v_payment.manual_review_reason is not distinct from
                'Stripe payment provider truth mismatch: charge_balance_transaction_expansion';
        if (v_was_transient_review and v_payment_status = 'succeeded')
            is distinct from (jsonb_typeof(v_recovery) = 'object')
        then
            raise exception 'validation: provider truth recovery does not match payment state';
        end if;

        update stripe_connect.payments
        set payment_status = v_payment_status,
            stripe_payment_intent_id = v_payment_intent_id,
            stripe_charge_id = v_charge_id,
            stripe_charge_balance_transaction_id = v_balance_transaction_id,
            actual_stripe_charge_fee_amount = v_charge_fee_amount,
            actual_stripe_processing_fee_amount = v_processing_fee_amount,
            actual_stripe_charge_net_amount = v_charge_net_amount,
            actual_stripe_fee_currency = v_fee_currency,
            actual_stripe_charge_fee_details = v_fee_details,
            paid_at = v_paid_at,
            cancelled_at = v_cancelled_at,
            last_provider_sync_at = greatest(
                v_payment.last_provider_sync_at,
                v_provider_synced_at
            )
        where id = p_payment_id
        returning * into v_payment;
        v_payment_json := to_jsonb(v_payment);

        if jsonb_typeof(v_recovery) = 'object' then
            insert into stripe_connect.provider_exceptions (
                deduplication_key, payment_id, operation_id, exception_type,
                severity, status, message, details, resolved_at, resolved_by
            ) values (
                v_exception_key, p_payment_id, null, 'provider_payment_truth_mismatch',
                'critical', 'open',
                'Stripe payment provider truth mismatch: charge_balance_transaction_expansion',
                jsonb_build_object(
                    'paymentIntentId', v_payment_intent_id,
                    'chargeId', v_charge_id,
                    'mismatches', jsonb_build_array('charge_balance_transaction_expansion')
                ),
                null, null
            ) on conflict (deduplication_key) do update
            set payment_id = excluded.payment_id,
                operation_id = excluded.operation_id,
                exception_type = excluded.exception_type,
                severity = excluded.severity,
                status = excluded.status,
                message = excluded.message,
                details = excluded.details,
                resolved_at = null,
                resolved_by = null;
            v_recovery_result := stripe_connect.recover_transient_provider_truth_review(
                p_payment_id,
                v_recovery->>'paymentIntentId',
                v_recovery->>'chargeId',
                v_recovery->>'balanceTransactionId',
                v_actor_kind,
                v_actor_id
            );
            v_recovered := coalesce((v_recovery_result->>'recovered')::boolean, false);
            v_payment_json := v_recovery_result->'payment';
            if v_recovered then
                v_projection_key := v_recovered_projection_key;
            end if;
        end if;

        perform stripe_connect.enqueue_commerce_provider_projection(
            p_payment_id,
            v_projection_key,
            'payment',
            p_payment_id::text
        );
        return jsonb_build_object('applied', true, 'payment', v_payment_json);
    end if;

    update stripe_connect.payments
    set payment_status = 'failed',
        settlement_status = 'manual_review',
        manual_review_reason = v_manual_review_reason,
        stripe_payment_intent_id = v_payment_intent_id,
        stripe_charge_id = v_charge_id,
        paid_at = null,
        last_provider_sync_at = greatest(
            v_payment.last_provider_sync_at,
            v_provider_synced_at
        )
    where id = p_payment_id
    returning * into v_payment;

    perform stripe_connect.enqueue_commerce_provider_projection(
        p_payment_id,
        v_projection_key,
        'payment',
        p_payment_id::text
    );
    insert into stripe_connect.provider_exceptions (
        deduplication_key, payment_id, operation_id, exception_type,
        severity, status, message, details, resolved_at, resolved_by
    ) values (
        v_exception_key, p_payment_id, null, 'provider_payment_truth_mismatch',
        'critical', 'open', v_manual_review_reason, v_details, null, null
    ) on conflict (deduplication_key) do update
    set payment_id = excluded.payment_id,
        exception_type = excluded.exception_type,
        severity = excluded.severity,
        status = excluded.status,
        message = excluded.message,
        details = excluded.details,
        resolved_at = null,
        resolved_by = null;
    begin
        insert into stripe_connect.payment_events (
            payment_id, event_type, actor_kind, actor_id, data
        ) values (
            p_payment_id, 'provider_payment_truth_mismatch',
            v_actor_kind, v_actor_id, v_details
        );
    exception when others then
        null;
    end;
    return jsonb_build_object('applied', true, 'payment', to_jsonb(v_payment));
end;
$$;

revoke execute on function stripe_connect.apply_payment_provider_projection(bigint, jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function stripe_connect.apply_payment_provider_projection(bigint, jsonb, jsonb)
    to service_role;

do $$
declare v_table text;
begin
    foreach v_table in array array[
        'accounts', 'platform_payout_controls', 'payments', 'payment_lifecycle_guards', 'financial_operations', 'transfers',
        'commerce_projection_outbox', 'commerce_projection_interventions', 'transfer_recovery_requests', 'transfer_reversals', 'seller_recovery_exposures', 'refunds', 'stripe_disputes',
        'irreversible_dispute_action_approvals', 'payout_events'
    ] loop
        execute format('drop trigger if exists %I_set_updated_at on stripe_connect.%I', v_table, v_table);
        execute format(
            'create trigger %I_set_updated_at before update on stripe_connect.%I for each row execute function stripe_connect.set_updated_at()',
            v_table, v_table
        );
    end loop;
end $$;

do $$
declare v_table text;
begin
    foreach v_table in array array[
        'accounts', 'marketplace_terms_acceptances', 'platform_payout_controls', 'payments', 'payment_lifecycle_guards', 'payment_events', 'financial_operations',
        'commerce_projection_outbox', 'commerce_projection_interventions', 'transfers', 'transfer_recovery_requests', 'transfer_reversals', 'seller_recovery_exposures', 'refunds', 'stripe_disputes',
        'stripe_dispute_evidence', 'irreversible_dispute_action_approvals',
        'stripe_events', 'payout_events',
        'reconciliation_runs', 'provider_exceptions'
    ] loop
        execute format('alter table stripe_connect.%I enable row level security', v_table);
        execute format('alter table stripe_connect.%I force row level security', v_table);
    end loop;
end $$;

revoke all on all tables in schema stripe_connect from public, anon, authenticated;
revoke all on all functions in schema stripe_connect from public, anon, authenticated;

grant usage on schema stripe_connect to service_role;
grant select, insert, update, delete on all tables in schema stripe_connect to service_role;
grant usage, select on all sequences in schema stripe_connect to service_role;
grant execute on all functions in schema stripe_connect to service_role;

alter default privileges in schema stripe_connect revoke execute on functions from public;
alter default privileges in schema stripe_connect grant select, insert, update, delete on tables to service_role;
alter default privileges in schema stripe_connect grant usage, select on sequences to service_role;
alter default privileges in schema stripe_connect grant execute on functions to service_role;

comment on schema stripe_connect is
    'Private Stripe provider ledger for protected C2C platform charges and separate Transfers.';
comment on table stripe_connect.payments is
    'Immutable payment allocation and independent payment, settlement, and dispute projections.';
comment on table stripe_connect.marketplace_terms_acceptances is
    'Immutable, server-timestamped proof that a CMS seller accepted one exact marketplace agreement version and SHA-256 document hash.';
comment on table stripe_connect.payment_lifecycle_guards is
    'Serialized create-versus-cancel guard; an absent-payment cancellation is a durable tombstone that permanently rejects later provider creation.';
comment on table stripe_connect.financial_operations is
    'Durable idempotent operation reservations around non-transactional Stripe API calls.';
comment on table stripe_connect.stripe_events is
    'Raw, signature-verified Stripe events persisted before acknowledgement.';

commit;
