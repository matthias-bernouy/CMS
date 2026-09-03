

create table if not exists commerce.settlement_release_authorizations (
    id uuid primary key default gen_random_uuid(),
    order_id bigint not null references commerce.orders(id) on delete restrict,
    business_key text not null constraint settlement_release_authorizations_business_key_key unique,
    release_kind text not null default 'initial',
    recovery_revision integer,
    authorized_amount bigint not null,
    currency text not null,
    financial_terms_hash text not null,
    status text not null default 'authorized',
    authorized_by_kind text not null,
    authorized_by text not null,
    reason text,
    created_at timestamptz not null default now(),
    constraint settlement_release_authorizations_amount check (authorized_amount between 1 and 9007199254740991),
    constraint settlement_release_authorizations_kind check (release_kind in ('initial', 'reserve', 'recovery')),
    constraint settlement_release_authorizations_recovery_revision check (
        (release_kind = 'recovery' and recovery_revision > 0)
        or (release_kind <> 'recovery' and recovery_revision is null)
    ),
    constraint settlement_release_authorizations_currency check (currency = 'eur'),
    constraint settlement_release_authorizations_hash check (financial_terms_hash ~ '^[a-f0-9]{64}$'),
    constraint settlement_release_authorizations_status check (status in ('authorized', 'provider_pending', 'confirmed', 'failed', 'manual_review')),
    constraint settlement_release_authorizations_actor check (authorized_by_kind in ('finance', 'admin', 'system'))
);

alter table commerce.settlement_release_authorizations
    add column if not exists release_kind text not null default 'initial',
    add column if not exists recovery_revision integer;

alter table commerce.settlement_release_authorizations
    drop constraint if exists settlement_release_authorizations_order_id_key,
    drop constraint if exists settlement_release_authorizations_order_unique,
    drop constraint if exists settlement_release_authorizations_order_kind_unique,
    drop constraint if exists settlement_release_authorizations_kind,
    drop constraint if exists settlement_release_authorizations_recovery_revision,
    drop constraint if exists settlement_release_authorizations_hash,
    drop constraint if exists settlement_release_authorizations_actor;

alter table commerce.settlement_release_authorizations
    add constraint settlement_release_authorizations_kind
        check (release_kind in ('initial', 'reserve', 'recovery')),
    add constraint settlement_release_authorizations_recovery_revision check (
        (release_kind = 'recovery' and recovery_revision > 0)
        or (release_kind <> 'recovery' and recovery_revision is null)
    ),
    add constraint settlement_release_authorizations_hash
        check (financial_terms_hash ~ '^[a-f0-9]{64}$'),
    add constraint settlement_release_authorizations_actor
        check (authorized_by_kind in ('finance', 'admin', 'system'));

create unique index if not exists settlement_release_authorizations_fixed_kind_unique
    on commerce.settlement_release_authorizations(order_id, release_kind)
    where release_kind in ('initial', 'reserve');
create unique index if not exists settlement_release_authorizations_recovery_revision_unique
    on commerce.settlement_release_authorizations(order_id, recovery_revision)
    where release_kind = 'recovery';
