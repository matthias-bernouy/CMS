

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