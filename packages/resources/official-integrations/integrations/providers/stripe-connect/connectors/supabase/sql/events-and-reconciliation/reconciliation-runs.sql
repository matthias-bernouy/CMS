

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