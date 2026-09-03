

create table if not exists stripe_connect.commerce_projection_outbox (
    id bigint generated always as identity primary key,
    operation_id bigint references stripe_connect.financial_operations(id) on delete restrict,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    projection_key text not null constraint commerce_projection_outbox_projection_key_key unique,
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
create index if not exists commerce_projection_outbox_refund_predecessor_idx
    on stripe_connect.commerce_projection_outbox(operation_id, causal_sequence)
    where projection_kind = 'refund' and projection_status <> 'succeeded';
