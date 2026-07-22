

create table if not exists commerce.financial_operation_dispatch_claims (
    operation_kind text not null,
    operation_id text not null,
    order_id bigint not null references commerce.orders(id) on delete restrict,
    available_at timestamptz not null default now(),
    claimed_at timestamptz,
    claimed_by text,
    attempts integer not null default 0,
    last_error text,
    created_at timestamptz not null default now(),
    primary key (operation_kind, operation_id),
    constraint financial_operation_dispatch_claims_kind check (operation_kind in ('release', 'refund', 'payment_cancellation')),
    constraint financial_operation_dispatch_claims_id check (length(btrim(operation_id)) > 0),
    constraint financial_operation_dispatch_claims_attempts check (attempts >= 0)
);

alter table commerce.financial_operation_dispatch_claims
    drop constraint if exists financial_operation_dispatch_claims_kind;
alter table commerce.financial_operation_dispatch_claims
    add constraint financial_operation_dispatch_claims_kind
    check (operation_kind in ('release', 'refund', 'payment_cancellation'));

create index if not exists financial_operation_dispatch_claims_due_idx
    on commerce.financial_operation_dispatch_claims(operation_kind, available_at, created_at, operation_id);