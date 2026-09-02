

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