

create table if not exists commerce.order_settlements (
    order_id bigint primary key references commerce.orders(id) on delete restrict,
    status text not null default 'held',
    authorized_seller_amount bigint not null,
    total_transferred_amount bigint not null default 0,
    total_reversed_amount bigint not null default 0,
    total_refunded_amount bigint not null default 0,
    seller_reserve_liability_remaining_amount bigint not null default 0,
    platform_gross_remainder_amount bigint not null,
    provider_transfer_id bigint,
    manual_review_reason text,
    version integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint order_settlements_status check (status in (
        'held', 'eligible', 'release_pending', 'reserve_held', 'released', 'blocked',
        'refund_pending', 'refunded', 'reversal_pending', 'reversed', 'manual_review'
    )),
    constraint order_settlements_amounts check (
        authorized_seller_amount between 0 and 9007199254740991
        and total_transferred_amount between 0 and 9007199254740991
        and total_reversed_amount between 0 and total_transferred_amount
        and total_refunded_amount between 0 and 9007199254740991
        and seller_reserve_liability_remaining_amount between 0 and 9007199254740991
        and platform_gross_remainder_amount between 0 and 9007199254740991
        and total_transferred_amount - total_reversed_amount
            + seller_reserve_liability_remaining_amount <= authorized_seller_amount
    ),
    constraint order_settlements_provider_transfer check (
        provider_transfer_id is null or provider_transfer_id > 0
    ),
    constraint order_settlements_version check (version > 0)
);

alter table commerce.order_settlements
    drop constraint if exists order_settlements_amounts,
    drop constraint if exists order_settlements_status;

alter table commerce.order_settlements
    add constraint order_settlements_status check (status in (
        'held', 'eligible', 'release_pending', 'reserve_held', 'released', 'blocked',
        'refund_pending', 'refunded', 'reversal_pending', 'reversed', 'manual_review'
    )),
    add constraint order_settlements_amounts check (
        authorized_seller_amount between 0 and 9007199254740991
        and total_transferred_amount between 0 and 9007199254740991
        and total_reversed_amount between 0 and total_transferred_amount
        and total_refunded_amount between 0 and 9007199254740991
        and seller_reserve_liability_remaining_amount between 0 and 9007199254740991
        and platform_gross_remainder_amount between 0 and 9007199254740991
        and total_transferred_amount - total_reversed_amount
            + seller_reserve_liability_remaining_amount <= authorized_seller_amount
    );

create index if not exists order_settlements_status_idx
    on commerce.order_settlements(status, updated_at);