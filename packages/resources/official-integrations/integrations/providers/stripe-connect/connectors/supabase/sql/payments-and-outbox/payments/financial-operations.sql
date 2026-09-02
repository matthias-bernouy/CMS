

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