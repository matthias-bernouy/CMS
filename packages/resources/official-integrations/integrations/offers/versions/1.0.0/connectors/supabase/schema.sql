-- Supabase offers schema for CMS-backed sellable offer listings.
--
-- Offers own marketplace/ecommerce listing state only. Discounts, coupons,
-- carts, orders, reservations, delivery, payments, and advanced inventory are
-- intentionally out of scope.

begin;

create schema if not exists offers;

revoke all on schema offers from public;
revoke all on schema offers from anon;
revoke all on schema offers from authenticated;

create table if not exists offers.offers (
    id bigint generated always as identity primary key,
    slug text not null,
    title text not null,
    description text,
    product_id text,
    variant_id text,
    seller_kind text not null default 'merchant',
    seller_id text not null default 'default',
    price_amount integer not null default 0,
    currency text not null default 'eur',
    compare_at_amount integer,
    tax_behavior text not null default 'unspecified',
    status text not null default 'draft',
    visibility text not null default 'public',
    availability text not null default 'available',
    quantity_available integer,
    starts_at timestamptz,
    ends_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint offers_slug_not_blank check (length(btrim(slug)) > 0),
    constraint offers_title_not_blank check (length(btrim(title)) > 0),
    constraint offers_slug_key unique (slug),
    constraint offers_product_id_not_blank check (product_id is null or length(btrim(product_id)) > 0),
    constraint offers_variant_id_not_blank check (variant_id is null or length(btrim(variant_id)) > 0),
    constraint offers_seller_kind_valid check (seller_kind in ('merchant', 'user', 'external')),
    constraint offers_seller_id_not_blank check (length(btrim(seller_id)) > 0),
    constraint offers_price_amount_non_negative check (price_amount >= 0),
    constraint offers_compare_at_amount_non_negative check (compare_at_amount is null or compare_at_amount >= 0),
    constraint offers_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint offers_tax_behavior_valid check (tax_behavior in ('included', 'excluded', 'unspecified')),
    constraint offers_status_valid check (status in ('draft', 'active', 'paused', 'archived')),
    constraint offers_visibility_valid check (visibility in ('public', 'hidden')),
    constraint offers_availability_valid check (availability in ('available', 'unavailable', 'sold_out', 'preorder')),
    constraint offers_quantity_available_non_negative check (quantity_available is null or quantity_available >= 0),
    constraint offers_dates_ordered check (starts_at is null or ends_at is null or starts_at <= ends_at),
    constraint offers_metadata_object check (jsonb_typeof(metadata) = 'object')
);

alter table offers.offers
    add column if not exists variant_id text;

create table if not exists offers.external_references (
    id bigint generated always as identity primary key,
    provider text not null,
    entity_type text not null,
    entity_id bigint not null references offers.offers(id) on delete cascade,
    external_id text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint external_references_provider_not_blank check (length(btrim(provider)) > 0),
    constraint external_references_entity_type_not_blank check (length(btrim(entity_type)) > 0),
    constraint external_references_external_id_not_blank check (length(btrim(external_id)) > 0),
    constraint external_references_key unique (provider, entity_type, external_id),
    constraint external_references_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists offers_status_visibility_idx
    on offers.offers(status, visibility);

create index if not exists offers_seller_idx
    on offers.offers(seller_kind, seller_id);

create index if not exists offers_product_idx
    on offers.offers(product_id);

create index if not exists offers_product_variant_idx
    on offers.offers(product_id, variant_id);

create index if not exists offers_currency_idx
    on offers.offers(currency);

create index if not exists offers_updated_at_idx
    on offers.offers(updated_at desc);

create index if not exists external_references_entity_idx
    on offers.external_references(entity_type, entity_id);

create or replace function offers.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists offers_set_updated_at on offers.offers;
create trigger offers_set_updated_at
before update on offers.offers
for each row execute function offers.set_updated_at();

drop trigger if exists external_references_set_updated_at on offers.external_references;
create trigger external_references_set_updated_at
before update on offers.external_references
for each row execute function offers.set_updated_at();

alter table offers.offers enable row level security;
alter table offers.offers force row level security;
alter table offers.external_references enable row level security;
alter table offers.external_references force row level security;

revoke all on all tables in schema offers from public;
revoke all on all tables in schema offers from anon;
revoke all on all tables in schema offers from authenticated;
revoke all on all sequences in schema offers from public;
revoke all on all sequences in schema offers from anon;
revoke all on all sequences in schema offers from authenticated;
revoke all on all functions in schema offers from public;
revoke all on all functions in schema offers from anon;
revoke all on all functions in schema offers from authenticated;

grant usage on schema offers to service_role;
grant select, insert, update, delete on all tables in schema offers to service_role;
grant usage, select on all sequences in schema offers to service_role;
grant execute on all functions in schema offers to service_role;

alter default privileges in schema offers
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema offers
grant usage, select on sequences to service_role;
alter default privileges in schema offers
grant execute on functions to service_role;

comment on schema offers is
    'Private offers schema owned by Supabase Edge Functions.';
comment on table offers.offers is
    'Sellable marketplace/ecommerce offer listings without promotions, orders, payments, delivery, or advanced inventory.';
comment on column offers.offers.product_id is
    'Optional opaque reference to the external sellable item.';
comment on column offers.offers.variant_id is
    'Optional opaque reference to a concrete product variant.';
comment on column offers.offers.price_amount is
    'Base offer price in the smallest currency unit.';
comment on table offers.external_references is
    'Stable references for imports and future module interoperability.';

commit;
