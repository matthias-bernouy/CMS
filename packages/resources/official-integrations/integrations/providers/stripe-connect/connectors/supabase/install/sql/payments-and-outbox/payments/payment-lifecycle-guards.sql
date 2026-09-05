

create table if not exists stripe_connect.payment_lifecycle_guards (
    client_reference_id text primary key,
    payment_id bigint constraint payment_lifecycle_guards_payment_id_key unique references stripe_connect.payments(id) on delete restrict,
    cancellation_request_id text constraint payment_lifecycle_guards_cancellation_request_id_key unique,
    cancellation_reason text,
    cancellation_requested_at timestamptz,
    payment_linked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint payment_lifecycle_guards_reference_not_blank check (length(btrim(client_reference_id)) > 0),
    constraint payment_lifecycle_guards_cancellation_coherent check (
        (cancellation_request_id is null and cancellation_reason is null and cancellation_requested_at is null)
        or (length(btrim(cancellation_request_id)) > 0
            and length(btrim(cancellation_reason)) > 0
            and cancellation_requested_at is not null)
    ),
    constraint payment_lifecycle_guards_payment_coherent check (
        (payment_id is null and payment_linked_at is null)
        or (payment_id is not null and payment_linked_at is not null)
    )
);

insert into stripe_connect.payment_lifecycle_guards (
    client_reference_id, payment_id, payment_linked_at
)
select payment.client_reference_id, payment.id, payment.created_at
from stripe_connect.payments payment
on conflict (client_reference_id) do update set
    payment_id = coalesce(stripe_connect.payment_lifecycle_guards.payment_id, excluded.payment_id),
    payment_linked_at = coalesce(stripe_connect.payment_lifecycle_guards.payment_linked_at, excluded.payment_linked_at);
