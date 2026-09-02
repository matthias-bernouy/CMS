

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