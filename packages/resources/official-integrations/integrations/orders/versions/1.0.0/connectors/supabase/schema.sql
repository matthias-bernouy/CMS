-- Supabase orders schema for CMS-backed single-seller commerce orders.
--
-- Orders only: no payment, delivery, stock, reservation, tax, discount, or
-- pricing engines. The cms-orders Edge Function owns all reads and writes.
-- External systems are linked through typed immutable references.

begin;

create schema if not exists orders;

revoke all on schema orders from public;
revoke all on schema orders from anon;
revoke all on schema orders from authenticated;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists orders.orders (
    id text primary key,
    order_number text unique,
    seller_cms_user_id text not null,
    buyer_cms_user_id text,
    buyer_email text,
    buyer_name text,
    buyer_phone text,
    status text not null default 'draft',
    currency text not null default 'eur',
    subtotal_amount integer not null default 0,
    total_amount integer not null default 0,
    external_checkout_ref text,
    billing_address jsonb not null default '{}'::jsonb,
    shipping_address jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    placed_at timestamptz,
    cancelled_at timestamptz,
    completed_at timestamptz,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint orders_id_not_blank check (length(btrim(id)) > 0),
    constraint orders_order_number_not_blank check (
        order_number is null or length(btrim(order_number)) > 0
    ),
    constraint orders_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint orders_buyer_user_not_blank check (
        buyer_cms_user_id is null or length(btrim(buyer_cms_user_id)) > 0
    ),
    constraint orders_buyer_email_not_blank check (
        buyer_email is null or length(btrim(buyer_email)) > 0
    ),
    constraint orders_buyer_name_not_blank check (
        buyer_name is null or length(btrim(buyer_name)) > 0
    ),
    constraint orders_buyer_phone_not_blank check (
        buyer_phone is null or length(btrim(buyer_phone)) > 0
    ),
    constraint orders_status_valid check (status in ('draft', 'placed', 'cancelled', 'completed', 'archived')),
    constraint orders_currency_format check (currency = lower(currency) and currency ~ '^[a-z]{3}$'),
    constraint orders_subtotal_non_negative check (subtotal_amount >= 0),
    constraint orders_total_non_negative check (total_amount >= 0),
    constraint orders_total_matches_subtotal check (total_amount = subtotal_amount),
    constraint orders_external_checkout_ref_not_blank check (
        external_checkout_ref is null or length(btrim(external_checkout_ref)) > 0
    ),
    constraint orders_billing_address_object check (jsonb_typeof(billing_address) = 'object'),
    constraint orders_shipping_address_object check (jsonb_typeof(shipping_address) = 'object'),
    constraint orders_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists orders_seller_status_created_idx
    on orders.orders(seller_cms_user_id, status, created_at desc);

create index if not exists orders_buyer_status_created_idx
    on orders.orders(buyer_cms_user_id, status, created_at desc)
    where buyer_cms_user_id is not null;

create index if not exists orders_status_created_idx
    on orders.orders(status, created_at desc);

create index if not exists orders_created_at_idx
    on orders.orders(created_at desc);

-- ---------------------------------------------------------------------------
-- Immutable order line snapshots
-- ---------------------------------------------------------------------------
create table if not exists orders.order_lines (
    id bigint generated always as identity primary key,
    order_id text not null references orders.orders(id) on delete cascade,
    product_id text,
    variant_id text,
    external_product_ref text,
    external_variant_ref text,
    title text not null,
    sku text,
    quantity integer not null,
    unit_amount integer not null,
    line_total integer not null,
    currency text not null default 'eur',
    product_snapshot jsonb not null default '{}'::jsonb,
    variant_snapshot jsonb not null default '{}'::jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint order_lines_product_id_not_blank check (
        product_id is null or length(btrim(product_id)) > 0
    ),
    constraint order_lines_variant_id_not_blank check (
        variant_id is null or length(btrim(variant_id)) > 0
    ),
    constraint order_lines_external_product_ref_not_blank check (
        external_product_ref is null or length(btrim(external_product_ref)) > 0
    ),
    constraint order_lines_external_variant_ref_not_blank check (
        external_variant_ref is null or length(btrim(external_variant_ref)) > 0
    ),
    constraint order_lines_title_not_blank check (length(btrim(title)) > 0),
    constraint order_lines_sku_not_blank check (
        sku is null or length(btrim(sku)) > 0
    ),
    constraint order_lines_quantity_positive check (quantity > 0),
    constraint order_lines_unit_amount_non_negative check (unit_amount >= 0),
    constraint order_lines_line_total_matches check (line_total = unit_amount * quantity),
    constraint order_lines_currency_format check (currency = lower(currency) and currency ~ '^[a-z]{3}$'),
    constraint order_lines_product_snapshot_object check (jsonb_typeof(product_snapshot) = 'object'),
    constraint order_lines_variant_snapshot_object check (jsonb_typeof(variant_snapshot) = 'object'),
    constraint order_lines_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists order_lines_order_idx
    on orders.order_lines(order_id, id);

create index if not exists order_lines_product_idx
    on orders.order_lines(product_id)
    where product_id is not null;

create index if not exists order_lines_variant_idx
    on orders.order_lines(variant_id)
    where variant_id is not null;

-- ---------------------------------------------------------------------------
-- References to external operational systems
-- ---------------------------------------------------------------------------
create table if not exists orders.order_external_refs (
    id bigint generated always as identity primary key,
    order_id text not null references orders.orders(id) on delete cascade,
    kind text not null,
    provider text not null,
    external_id text not null,
    label text,
    status text,
    amount integer,
    currency text,
    url text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint order_refs_kind_valid check (
        kind in ('payment', 'shipment', 'stock_reservation', 'fulfillment', 'invoice', 'other')
    ),
    constraint order_refs_provider_not_blank check (length(btrim(provider)) > 0),
    constraint order_refs_external_id_not_blank check (length(btrim(external_id)) > 0),
    constraint order_refs_label_not_blank check (
        label is null or length(btrim(label)) > 0
    ),
    constraint order_refs_status_not_blank check (
        status is null or length(btrim(status)) > 0
    ),
    constraint order_refs_amount_non_negative check (amount is null or amount >= 0),
    constraint order_refs_currency_format check (
        currency is null or (currency = lower(currency) and currency ~ '^[a-z]{3}$')
    ),
    constraint order_refs_url_http check (
        url is null or url ~* '^https?://'
    ),
    constraint order_refs_metadata_object check (jsonb_typeof(metadata) = 'object'),
    constraint order_refs_key unique (order_id, kind, provider, external_id)
);

create index if not exists order_refs_order_kind_idx
    on orders.order_external_refs(order_id, kind);

create index if not exists order_refs_lookup_idx
    on orders.order_external_refs(kind, provider, external_id);

-- ---------------------------------------------------------------------------
-- Order event timeline
-- ---------------------------------------------------------------------------
create table if not exists orders.order_events (
    id bigint generated always as identity primary key,
    order_id text not null references orders.orders(id) on delete cascade,
    event_type text not null,
    actor_user_id text,
    message text,
    data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint order_events_type_not_blank check (length(btrim(event_type)) > 0),
    constraint order_events_actor_not_blank check (
        actor_user_id is null or length(btrim(actor_user_id)) > 0
    ),
    constraint order_events_message_not_blank check (
        message is null or length(btrim(message)) > 0
    ),
    constraint order_events_data_object check (jsonb_typeof(data) = 'object')
);

create index if not exists order_events_order_created_idx
    on orders.order_events(order_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
create or replace function orders.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists orders_set_updated_at on orders.orders;
create trigger orders_set_updated_at
before update on orders.orders
for each row execute function orders.set_updated_at();

drop trigger if exists order_refs_set_updated_at on orders.order_external_refs;
create trigger order_refs_set_updated_at
before update on orders.order_external_refs
for each row execute function orders.set_updated_at();

alter table orders.orders enable row level security;
alter table orders.orders force row level security;
alter table orders.order_lines enable row level security;
alter table orders.order_lines force row level security;
alter table orders.order_external_refs enable row level security;
alter table orders.order_external_refs force row level security;
alter table orders.order_events enable row level security;
alter table orders.order_events force row level security;

revoke all on all tables in schema orders from public;
revoke all on all tables in schema orders from anon;
revoke all on all tables in schema orders from authenticated;
revoke all on all sequences in schema orders from public;
revoke all on all sequences in schema orders from anon;
revoke all on all sequences in schema orders from authenticated;
revoke all on all functions in schema orders from public;
revoke all on all functions in schema orders from anon;
revoke all on all functions in schema orders from authenticated;

grant usage on schema orders to service_role;
grant select, insert, update, delete on all tables in schema orders to service_role;
grant usage, select on all sequences in schema orders to service_role;
grant execute on all functions in schema orders to service_role;

alter default privileges in schema orders
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema orders
grant usage, select on sequences to service_role;

alter default privileges in schema orders
grant execute on functions to service_role;

comment on schema orders is
    'Private single-seller order ledger owned by Supabase Edge Functions.';
comment on table orders.orders is
    'Single-seller order headers with immutable commercial totals and customer snapshots.';
comment on table orders.order_lines is
    'Immutable order line snapshots. Product and variant ids are references only.';
comment on table orders.order_external_refs is
    'References to external payment, delivery, stock, reservation, fulfilment, invoice, or ERP systems.';
comment on table orders.order_events is
    'Order timeline events written by the cms-orders Edge Function.';
comment on column orders.orders.total_amount is
    'Total in the smallest currency unit. Version 1 keeps total equal to subtotal and does not own taxes or discounts.';

commit;
