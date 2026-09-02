
alter table delivery.shipments
    add column if not exists tracking_next_attempt_at timestamptz,
    add column if not exists tracking_claimed_at timestamptz,
    add column if not exists tracking_claimed_by text;
alter table delivery.shipments
    add column if not exists carrier_accepted_at timestamptz,
    add column if not exists arrived_at_pickup_point_at timestamptz,
    add column if not exists available_for_pickup_at timestamptz,
    add column if not exists recipient_handoff_at timestamptz,
    add column if not exists pickup_expired_at timestamptz,
    add column if not exists returning_to_sender_at timestamptz,
    add column if not exists returned_to_sender_at timestamptz,
    add column if not exists incident_at timestamptz,
    add column if not exists lost_at timestamptz,
    add column if not exists seller_handoff_declared_at timestamptz;

alter table delivery.shipments
    drop constraint if exists shipments_status_valid;
alter table delivery.shipments
    add constraint shipments_status_valid check (
        status in (
            'creating', 'created', 'label_ready', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup', 'collected_by_recipient',
            'pickup_expired', 'returning_to_sender', 'returned_to_sender', 'incident',
            'lost', 'cancelled_unscanned', 'cancelled', 'failed', 'unknown', 'manual_review'
        )
    );

create index if not exists shipments_external_order_id_idx
    on delivery.shipments(external_order_id)
    where external_order_id is not null;

drop index if exists delivery.shipments_idempotency_key_unique;
create unique index shipments_idempotency_key_unique
    on delivery.shipments(idempotency_key);

create index if not exists shipments_status_created_at_idx
    on delivery.shipments(status, created_at desc);

create index if not exists shipments_tracking_due_idx
    on delivery.shipments(status, tracking_next_attempt_at, tracking_checked_at, created_at)
    where expedition_number is not null;

create index if not exists shipments_created_at_idx
    on delivery.shipments(created_at desc);

create index if not exists shipments_creation_manual_review_idx
    on delivery.shipments(creation_manual_review_at desc, created_at, id)
    where status = 'unknown';