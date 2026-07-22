

create table if not exists delivery.projection_review_actions (
    id bigint generated always as identity primary key,
    shipment_event_id bigint not null references delivery.shipment_events(id) on delete restrict,
    action text not null,
    actor_cms_user_id text not null,
    reason text not null,
    previous_status text not null,
    resulting_status text not null,
    created_at timestamptz not null default now(),
    constraint projection_review_actions_action check (action in ('requeue', 'resolve_duplicate')),
    constraint projection_review_actions_actor check (length(btrim(actor_cms_user_id)) > 0),
    constraint projection_review_actions_reason check (length(btrim(reason)) >= 8)
);

create index if not exists projection_review_actions_event_idx
    on delivery.projection_review_actions(shipment_event_id, created_at desc);