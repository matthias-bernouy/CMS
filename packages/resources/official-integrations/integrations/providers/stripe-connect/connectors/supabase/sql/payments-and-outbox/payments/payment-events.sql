

create table if not exists stripe_connect.payment_events (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    event_type text not null,
    actor_kind text not null,
    actor_id text not null,
    previous_payment_status text,
    next_payment_status text,
    previous_settlement_status text,
    next_settlement_status text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint payment_events_type_not_blank check (length(btrim(event_type)) > 0),
    constraint payment_events_actor_kind_valid check (
        actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')
    ),
    constraint payment_events_data_object check (jsonb_typeof(data) = 'object')
);

alter table stripe_connect.payment_events
    drop constraint if exists payment_events_actor_kind_valid,
    add constraint payment_events_actor_kind_valid check (
        actor_kind in ('system', 'webhook', 'reconciliation', 'support', 'finance', 'admin')
    );