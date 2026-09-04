

create table if not exists stripe_connect.transfer_reversals (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_id bigint references stripe_connect.transfer_recovery_requests(id) on delete restrict,
    allocation_index integer,
    transfer_id bigint not null references stripe_connect.transfers(id) on delete restrict,
    operation_id bigint not null constraint transfer_reversals_operation_id_key unique references stripe_connect.financial_operations(id) on delete restrict,
    reversal_request_id text not null constraint transfer_reversals_reversal_request_id_key unique,
    stripe_transfer_reversal_id text constraint transfer_reversals_stripe_transfer_reversal_id_key unique,
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
