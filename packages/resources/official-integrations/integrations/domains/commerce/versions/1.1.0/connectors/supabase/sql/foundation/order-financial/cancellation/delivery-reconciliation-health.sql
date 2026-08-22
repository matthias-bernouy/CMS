

create table if not exists commerce.delivery_reconciliation_health (
    id text primary key default 'mondial-relay',
    run_key text not null,
    checked_at timestamptz not null,
    pending_projection_count integer not null default 0,
    manual_review_count integer not null default 0,
    tracking_error_count integer not null default 0,
    updated_at timestamptz not null default now(),
    constraint delivery_reconciliation_health_singleton check (id = 'mondial-relay'),
    constraint delivery_reconciliation_health_run_key check (length(btrim(run_key)) > 0),
    constraint delivery_reconciliation_health_counts check (
        pending_projection_count >= 0 and manual_review_count >= 0 and tracking_error_count >= 0
    )
);

create table if not exists commerce.delivery_order_reconciliation_health (
    order_id bigint primary key references commerce.orders(id) on delete cascade,
    run_key text not null,
    checked_at timestamptz not null,
    shipment_id text not null,
    provider_reference text,
    shipment_status text not null,
    pending_projection_count integer not null default 0,
    manual_review_count integer not null default 0,
    tracking_error_count integer not null default 0,
    tracking_checked_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint delivery_order_health_run_key check (length(btrim(run_key)) > 0),
    constraint delivery_order_health_shipment_id check (length(btrim(shipment_id)) > 0),
    constraint delivery_order_health_provider_reference check (
        provider_reference is null or length(btrim(provider_reference)) > 0
    ),
    constraint delivery_order_health_shipment_status check (length(btrim(shipment_status)) > 0),
    constraint delivery_order_health_counts check (
        pending_projection_count >= 0
        and manual_review_count >= 0
        and tracking_error_count >= 0
    )
);