create table if not exists commerce.order_consent_acceptances (
    id bigint generated always as identity primary key,
    order_id bigint not null references commerce.orders(id) on delete restrict,
    checkout_group_id uuid not null references commerce.checkout_groups(id) on delete restrict,
    payment_attempt_id bigint not null references commerce.order_payment_attempts(id) on delete restrict,
    buyer_cms_user_id text not null,
    context_key text not null,
    operation_key text not null,
    consent_acceptance_id uuid not null,
    document_key text not null,
    document_version_id text not null,
    content_hash text not null,
    correlation_id uuid not null,
    accepted_at timestamptz not null,
    constraint order_consent_subject_length check (length(btrim(buyer_cms_user_id)) between 1 and 512),
    constraint order_consent_context_format check (context_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
    constraint order_consent_operation_length check (length(btrim(operation_key)) between 1 and 512),
    constraint order_consent_document_format check (document_key ~ '^[a-z][a-z0-9_.-]{0,79}$'),
    constraint order_consent_version_format check (document_version_id ~ '^[a-f0-9]{64}$'),
    constraint order_consent_hash_format check (content_hash ~ '^[a-f0-9]{64}$'),
    constraint order_consent_attempt_version_unique unique (payment_attempt_id, context_key, document_version_id)
);

create index if not exists order_consent_order_idx
    on commerce.order_consent_acceptances(order_id, accepted_at, id);
create index if not exists order_consent_checkout_idx
    on commerce.order_consent_acceptances(checkout_group_id);
create index if not exists order_consent_receipt_idx
    on commerce.order_consent_acceptances(consent_acceptance_id);

alter table commerce.order_consent_acceptances enable row level security;
alter table commerce.order_consent_acceptances force row level security;

comment on table commerce.order_consent_acceptances is
    'Immutable payment-operation links to evidence owned by the Consent integration; contains no document snapshots.';
