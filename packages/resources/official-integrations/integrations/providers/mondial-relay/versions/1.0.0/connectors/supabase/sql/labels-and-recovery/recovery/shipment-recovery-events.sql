

create table if not exists delivery.shipment_recovery_events (
    id bigint generated always as identity primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    actor_cms_user_id text not null,
    reason text not null,
    previous_status text not null,
    expedition_number text not null,
    created_at timestamptz not null default now(),
    constraint shipment_recovery_actor_not_blank check (length(btrim(actor_cms_user_id)) > 0),
    constraint shipment_recovery_reason_not_blank check (length(btrim(reason)) > 0),
    constraint shipment_recovery_expedition_not_blank check (length(btrim(expedition_number)) > 0)
);

create index if not exists shipment_recovery_events_shipment_idx
    on delivery.shipment_recovery_events(shipment_id);