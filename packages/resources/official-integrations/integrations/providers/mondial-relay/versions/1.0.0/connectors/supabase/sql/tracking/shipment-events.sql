

-- ---------------------------------------------------------------------------
-- Tracking events
-- ---------------------------------------------------------------------------
create table if not exists delivery.shipment_events (
    id bigint generated always as identity primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    order_public_id text not null,
    expedition_number text not null,
    event_label text not null,
    event_date date,
    event_time text,
    provider_event_key text,
    normalized_status text,
    occurred_at timestamptz,
    commerce_projected_at timestamptz,
    projection_status text not null default 'pending',
    projection_attempts integer not null default 0,
    projection_next_attempt_at timestamptz not null default now(),
    projection_claimed_at timestamptz,
    projection_claimed_by text,
    projection_claim_token uuid,
    projection_last_error text,
    projection_manual_review_at timestamptz,
    location text,
    relay_number text,
    relay_country text,
    raw_event jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint shipment_events_expedition_number_not_blank check (length(btrim(expedition_number)) > 0),
    constraint shipment_events_order_public_id_not_blank check (length(btrim(order_public_id)) > 0),
    constraint shipment_events_event_label_not_blank check (length(btrim(event_label)) > 0),
    constraint shipment_events_provider_event_key_not_blank check (
        provider_event_key is null or length(btrim(provider_event_key)) > 0
    ),
    constraint shipment_events_provider_event_key_unique unique (shipment_id, provider_event_key),
    constraint shipment_events_normalized_status_valid check (
        normalized_status is null or normalized_status in (
            'carrier_accepted', 'in_transit', 'arrived_at_pickup_point',
            'available_for_pickup', 'collected_by_recipient', 'pickup_expired',
            'returning_to_sender', 'returned_to_sender', 'incident', 'lost'
        )
    ),
    constraint shipment_events_event_time_not_blank check (
        event_time is null or length(btrim(event_time)) > 0
    ),
    constraint shipment_events_relay_country_valid check (
        relay_country is null or relay_country ~ '^[A-Z]{2}$'
    ),
    constraint shipment_events_raw_event_object check (jsonb_typeof(raw_event) = 'object'),
    constraint shipment_events_projection_status_valid check (
        projection_status in ('pending', 'processing', 'retry_wait', 'projected', 'manual_review')
    ),
    constraint shipment_events_projection_attempts_valid check (projection_attempts between 0 and 100),
    constraint shipment_events_projection_claim_consistent check (
        (projection_status = 'processing' and projection_claimed_at is not null
            and projection_claimed_by is not null and projection_claim_token is not null)
        or (projection_status <> 'processing' and projection_claimed_at is null
            and projection_claimed_by is null and projection_claim_token is null)
    )
);

alter table delivery.shipment_events
    add column if not exists provider_event_key text;
alter table delivery.shipment_events
    add column if not exists normalized_status text,
    add column if not exists occurred_at timestamptz,
    add column if not exists order_public_id text,
    add column if not exists commerce_projected_at timestamptz;
alter table delivery.shipment_events
    add column if not exists projection_status text not null default 'pending',
    add column if not exists projection_attempts integer not null default 0,
    add column if not exists projection_next_attempt_at timestamptz not null default now(),
    add column if not exists projection_claimed_at timestamptz,
    add column if not exists projection_claimed_by text,
    add column if not exists projection_claim_token uuid,
    add column if not exists projection_last_error text,
    add column if not exists projection_manual_review_at timestamptz;

update delivery.shipment_events
set projection_status = 'projected', projection_next_attempt_at = now()
where commerce_projected_at is not null and projection_status <> 'projected';

alter table delivery.shipment_events
    drop constraint if exists shipment_events_projection_status_valid,
    drop constraint if exists shipment_events_projection_attempts_valid,
    drop constraint if exists shipment_events_projection_claim_consistent;
alter table delivery.shipment_events
    add constraint shipment_events_projection_status_valid check (
        projection_status in ('pending', 'processing', 'retry_wait', 'projected', 'manual_review')
    ),
    add constraint shipment_events_projection_attempts_valid check (projection_attempts between 0 and 100),
    add constraint shipment_events_projection_claim_consistent check (
        (projection_status = 'processing' and projection_claimed_at is not null
            and projection_claimed_by is not null and projection_claim_token is not null)
        or (projection_status <> 'processing' and projection_claimed_at is null
            and projection_claimed_by is null and projection_claim_token is null)
    );

create unique index if not exists shipment_events_provider_event_key_unique
    on delivery.shipment_events(shipment_id, provider_event_key);

create index if not exists shipment_events_shipment_created_at_idx
    on delivery.shipment_events(shipment_id, created_at desc);

create index if not exists shipment_events_expedition_number_idx
    on delivery.shipment_events(expedition_number);

drop index if exists delivery.shipment_events_pending_commerce_idx;
create index shipment_events_pending_commerce_idx
    on delivery.shipment_events(projection_next_attempt_at, created_at, id)
    where normalized_status is not null and commerce_projected_at is null
        and projection_status in ('pending', 'retry_wait');

create index if not exists shipment_events_projection_manual_review_idx
    on delivery.shipment_events(projection_manual_review_at desc, id)
    where projection_status = 'manual_review';