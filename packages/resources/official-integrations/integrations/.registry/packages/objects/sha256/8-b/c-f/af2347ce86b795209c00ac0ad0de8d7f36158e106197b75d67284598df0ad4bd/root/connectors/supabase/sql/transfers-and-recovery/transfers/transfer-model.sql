

create table if not exists stripe_connect.transfers (
    id bigint generated always as identity primary key,
    payment_id bigint not null references stripe_connect.payments(id) on delete restrict,
    operation_id bigint not null unique references stripe_connect.financial_operations(id) on delete restrict,
    release_authorization_id text not null unique,
    release_kind text not null default 'initial',
    stripe_transfer_id text unique,
    source_charge_id text,
    destination_account_id text not null,
    transfer_group text not null,
    amount bigint not null,
    currency text not null,
    status text not null default 'reserved',
    provider_snapshot jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transfers_release_authorization_not_blank check (length(btrim(release_authorization_id)) > 0),
    constraint transfers_stripe_id_format check (stripe_transfer_id is null or stripe_transfer_id like 'tr_%'),
    constraint transfers_release_kind check (release_kind in ('initial', 'reserve', 'recovery')),
    constraint transfers_source_charge_format check (
        (release_kind in ('initial', 'reserve') and source_charge_id like 'ch_%')
        or (release_kind = 'recovery' and source_charge_id is null)
    ),
    constraint transfers_destination_format check (destination_account_id like 'acct_%'),
    constraint transfers_amount_positive check (amount > 0),
    constraint transfers_currency_eur check (currency = 'eur'),
    constraint transfers_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'partially_reversed', 'reversed', 'manual_review')
    ),
    constraint transfers_snapshot_object check (
        provider_snapshot is null or jsonb_typeof(provider_snapshot) = 'object'
    )
);

alter table stripe_connect.transfers
    add column if not exists release_kind text not null default 'initial',
    alter column source_charge_id drop not null;
alter table stripe_connect.transfers
    drop constraint if exists transfers_release_kind,
    drop constraint if exists transfers_source_charge_format,
    drop constraint if exists transfers_status_valid;
alter table stripe_connect.transfers
    add constraint transfers_release_kind check (release_kind in ('initial', 'reserve', 'recovery')),
    add constraint transfers_source_charge_format check (
        (release_kind in ('initial', 'reserve') and source_charge_id like 'ch_%')
        or (release_kind = 'recovery' and source_charge_id is null)
    ),
    add constraint transfers_status_valid check (
        status in ('reserved', 'processing', 'succeeded', 'failed', 'partially_reversed', 'reversed', 'manual_review')
    );