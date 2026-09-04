

create table if not exists stripe_connect.stripe_disputes (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    stripe_dispute_id text not null constraint stripe_disputes_stripe_dispute_id_key unique,
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
