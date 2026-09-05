

create table if not exists stripe_connect.commerce_projection_interventions (
    id bigint generated always as identity primary key,
    projection_id bigint not null references stripe_connect.commerce_projection_outbox(id) on delete restrict,
    intervention_revision bigint not null,
    action text not null,
    actor_id text not null,
    reason text not null,
    previous_status text not null,
    next_status text not null,
    created_at timestamptz not null default now(),
    constraint commerce_projection_interventions_revision check (intervention_revision > 0),
    constraint commerce_projection_interventions_action check (action = 'requeue'),
    constraint commerce_projection_interventions_actor check (length(btrim(actor_id)) > 0),
    constraint commerce_projection_interventions_reason check (length(btrim(reason)) > 0),
    constraint commerce_projection_interventions_unique unique (projection_id, intervention_revision)
);
