

create table if not exists commerce.order_fulfillments (
    order_id bigint primary key references commerce.orders(id) on delete restrict,
    status text not null default 'awaiting_shipment',
    provider_reference text,
    payment_confirmed_at timestamptz,
    seller_handoff_deadline timestamptz not null,
    scan_grace_deadline timestamptz not null,
    seller_handoff_declared_at timestamptz,
    carrier_accepted_at timestamptz,
    arrived_at_pickup_point_at timestamptz,
    available_for_pickup_at timestamptz,
    recipient_handoff_at timestamptz,
    recipient_handoff_first_observed_at timestamptz,
    claim_window_started_at timestamptz,
    claim_by_at timestamptz,
    release_eligible_at timestamptz,
    blocking_reason text,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint order_fulfillments_status check (status in (
        'awaiting_shipment', 'shipment_creating', 'label_created', 'seller_handoff_declared', 'carrier_accepted',
        'in_transit', 'arrived_at_pickup_point', 'available_for_pickup',
        'collected_by_recipient', 'incident', 'lost', 'pickup_expired',
        'returning_to_sender', 'returned_to_sender', 'cancelled', 'manual_review'
    )),
    constraint order_fulfillments_provider_reference check (
        provider_reference is null or length(btrim(provider_reference)) > 0
    ),
    constraint order_fulfillments_deadlines check (scan_grace_deadline >= seller_handoff_deadline),
    constraint order_fulfillments_payment_confirmation_deadlines check (
        payment_confirmed_at is null or seller_handoff_deadline >= payment_confirmed_at
    ),
    constraint order_fulfillments_claim_window check (
        (recipient_handoff_at is null and recipient_handoff_first_observed_at is null
            and claim_window_started_at is null and claim_by_at is null
            and release_eligible_at is null)
        or (recipient_handoff_at is not null and recipient_handoff_first_observed_at is not null
            and claim_window_started_at >= recipient_handoff_at
            and claim_window_started_at >= recipient_handoff_first_observed_at
            and claim_by_at >= claim_window_started_at
            and release_eligible_at = claim_by_at)
    ),
    constraint order_fulfillments_version check (version > 0)
);

alter table commerce.order_fulfillments
    add column if not exists payment_confirmed_at timestamptz;
alter table commerce.order_fulfillments
    add column if not exists recipient_handoff_first_observed_at timestamptz;
alter table commerce.order_fulfillments
    add column if not exists claim_window_started_at timestamptz;
