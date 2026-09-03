

create table if not exists stripe_connect.transfer_recovery_requests (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    recovery_request_id text not null constraint transfer_recovery_requests_recovery_request_id_key unique,
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
