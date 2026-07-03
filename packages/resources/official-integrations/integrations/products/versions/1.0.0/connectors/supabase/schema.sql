-- Supabase products schema for a CMS-backed product catalogue.
--
-- Catalogue only: no vendors, prices, offers, orders, stock, payments, carts,
-- reservations, delivery, or Stripe state. The cms-products Edge Function owns
-- all reads and writes.

begin;

create schema if not exists products;

revoke all on schema products from public;
revoke all on schema products from anon;
revoke all on schema products from authenticated;

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table if not exists products.brands (
    id bigint generated always as identity primary key,
    slug text not null,
    name text not null,
    description text,
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint brands_slug_not_blank check (length(btrim(slug)) > 0),
    constraint brands_name_not_blank check (length(btrim(name)) > 0),
    constraint brands_slug_key unique (slug),
    constraint brands_status_valid check (status in ('active', 'inactive', 'archived')),
    constraint brands_metadata_object check (jsonb_typeof(metadata) = 'object')
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table if not exists products.categories (
    id bigint generated always as identity primary key,
    parent_id bigint references products.categories(id) on delete restrict,
    slug text not null,
    full_slug text not null,
    title text not null,
    description text,
    position integer not null default 0,
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint categories_slug_not_blank check (length(btrim(slug)) > 0),
    constraint categories_slug_no_slash check (strpos(slug, '/') = 0),
    constraint categories_title_not_blank check (length(btrim(title)) > 0),
    constraint categories_status_valid check (status in ('active', 'inactive', 'archived')),
    constraint categories_no_self_parent check (parent_id is null or parent_id <> id),
    constraint categories_metadata_object check (jsonb_typeof(metadata) = 'object'),
    constraint categories_full_slug_key unique (full_slug),
    constraint categories_parent_slug_key unique nulls not distinct (parent_id, slug)
);

-- ---------------------------------------------------------------------------
-- Products and variants
-- ---------------------------------------------------------------------------
create table if not exists products.products (
    id bigint generated always as identity primary key,
    slug text not null,
    title text not null,
    description text,
    brand_id bigint references products.brands(id) on delete set null,
    status text not null default 'draft',
    visibility text not null default 'public',
    metadata jsonb not null default '{}'::jsonb,
    search_vector tsvector generated always as (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint products_slug_not_blank check (length(btrim(slug)) > 0),
    constraint products_title_not_blank check (length(btrim(title)) > 0),
    constraint products_slug_key unique (slug),
    constraint products_status_valid check (status in ('draft', 'active', 'archived')),
    constraint products_visibility_valid check (visibility in ('public', 'hidden')),
    constraint products_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists products.product_variants (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    sku text,
    title text,
    is_default boolean not null default false,
    status text not null default 'active',
    position integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_variants_status_valid check (status in ('active', 'inactive', 'archived')),
    constraint product_variants_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists products.product_categories (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    category_id bigint not null references products.categories(id) on delete cascade,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    constraint product_categories_key unique (product_id, category_id)
);

create unique index if not exists product_variants_sku_key
    on products.product_variants (product_id, sku)
    where sku is not null;

create unique index if not exists product_variants_default_key
    on products.product_variants (product_id)
    where is_default;

-- ---------------------------------------------------------------------------
-- Attributes and taxonomy
-- ---------------------------------------------------------------------------
create table if not exists products.attributes (
    id bigint generated always as identity primary key,
    code text not null,
    name text not null,
    description text,
    data_type text not null default 'text',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint attributes_code_not_blank check (length(btrim(code)) > 0),
    constraint attributes_name_not_blank check (length(btrim(name)) > 0),
    constraint attributes_code_key unique (code),
    constraint attributes_data_type_valid check (data_type in ('text', 'number', 'boolean', 'option'))
);

create table if not exists products.attribute_options (
    id bigint generated always as identity primary key,
    attribute_id bigint not null references products.attributes(id) on delete cascade,
    value text not null,
    label text,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    constraint attribute_options_value_not_blank check (length(btrim(value)) > 0),
    constraint attribute_options_key unique (attribute_id, value)
);

create table if not exists products.category_attributes (
    id bigint generated always as identity primary key,
    category_id bigint not null references products.categories(id) on delete cascade,
    attribute_id bigint not null references products.attributes(id) on delete cascade,
    is_filterable boolean not null default true,
    position integer not null default 0,
    constraint category_attributes_key unique (category_id, attribute_id)
);

create table if not exists products.product_variant_axes (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    attribute_id bigint not null references products.attributes(id) on delete restrict,
    position integer not null default 0,
    constraint product_variant_axes_key unique (product_id, attribute_id)
);

create table if not exists products.product_variant_axis_options (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    attribute_id bigint not null references products.attributes(id) on delete restrict,
    option_id bigint not null references products.attribute_options(id) on delete restrict,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    constraint product_variant_axis_options_key unique (product_id, attribute_id, option_id)
);

create table if not exists products.product_attribute_values (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    attribute_id bigint not null references products.attributes(id) on delete restrict,
    option_id bigint references products.attribute_options(id) on delete restrict,
    value_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_attribute_values_key unique (product_id, attribute_id),
    constraint product_attribute_values_value_present check (option_id is not null or value_text is not null)
);

create table if not exists products.variant_attribute_values (
    id bigint generated always as identity primary key,
    variant_id bigint not null references products.product_variants(id) on delete cascade,
    attribute_id bigint not null references products.attributes(id) on delete restrict,
    option_id bigint references products.attribute_options(id) on delete restrict,
    value_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint variant_attribute_values_key unique (variant_id, attribute_id),
    constraint variant_attribute_values_value_present check (option_id is not null or value_text is not null)
);

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------
create table if not exists products.media (
    id bigint generated always as identity primary key,
    cms_file_id text,
    url text,
    storage_bucket text,
    storage_path text,
    alt text,
    mime_type text,
    width integer,
    height integer,
    file_size bigint,
    original_filename text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint media_source_present check (
        cms_file_id is not null
        or url is not null
        or storage_path is not null
    )
);

alter table products.media
    add column if not exists storage_bucket text;

alter table products.media
    add column if not exists storage_path text;

alter table products.media
    add column if not exists file_size bigint;

alter table products.media
    add column if not exists original_filename text;

alter table products.media
    drop constraint if exists media_source_present;

alter table products.media
    add constraint media_source_present check (
        cms_file_id is not null
        or url is not null
        or storage_path is not null
    );

create unique index if not exists media_cms_file_id_key
    on products.media (cms_file_id)
    where cms_file_id is not null;

create unique index if not exists media_url_key
    on products.media (url)
    where url is not null;

create unique index if not exists media_storage_path_key
    on products.media (storage_bucket, storage_path)
    where storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'products-media',
    'products-media',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists products.product_media (
    id bigint generated always as identity primary key,
    product_id bigint not null references products.products(id) on delete cascade,
    media_id bigint not null references products.media(id) on delete cascade,
    sort_order integer not null default 0,
    is_main boolean not null default false,
    constraint product_media_key unique (product_id, media_id)
);

create unique index if not exists product_media_main_key
    on products.product_media (product_id)
    where is_main;

create table if not exists products.variant_media (
    id bigint generated always as identity primary key,
    variant_id bigint not null references products.product_variants(id) on delete cascade,
    media_id bigint not null references products.media(id) on delete cascade,
    sort_order integer not null default 0,
    is_main boolean not null default false,
    constraint variant_media_key unique (variant_id, media_id)
);

create unique index if not exists variant_media_main_key
    on products.variant_media (variant_id)
    where is_main;

-- ---------------------------------------------------------------------------
-- External references for imports and later module links
-- ---------------------------------------------------------------------------
create table if not exists products.external_references (
    id bigint generated always as identity primary key,
    provider text not null,
    entity_type text not null,
    entity_id bigint not null,
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

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists categories_parent_idx on products.categories(parent_id);
create index if not exists categories_status_idx on products.categories(status);
create index if not exists products_status_visibility_idx on products.products(status, visibility);
create index if not exists products_brand_idx on products.products(brand_id);
create index if not exists products_search_idx on products.products using gin(search_vector);
create index if not exists product_categories_product_idx on products.product_categories(product_id);
create index if not exists product_categories_category_idx on products.product_categories(category_id);
create index if not exists product_variants_product_idx on products.product_variants(product_id);
create index if not exists product_variant_axis_options_product_idx on products.product_variant_axis_options(product_id);
create index if not exists product_media_product_idx on products.product_media(product_id);
create index if not exists variant_media_variant_idx on products.variant_media(variant_id);
create index if not exists product_attribute_values_product_idx on products.product_attribute_values(product_id);
create index if not exists variant_attribute_values_variant_idx on products.variant_attribute_values(variant_id);
create index if not exists external_references_entity_idx on products.external_references(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
create or replace function products.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'brands', 'categories', 'products', 'product_variants', 'attributes',
        'product_attribute_values', 'variant_attribute_values', 'media',
        'external_references'
    ]
    loop
        execute format('drop trigger if exists %I on products.%I', t || '_set_updated_at', t);
        execute format(
            'create trigger %I before update on products.%I for each row execute function products.set_updated_at()',
            t || '_set_updated_at', t
        );
    end loop;
end;
$$;

create or replace function products.category_compute_full_slug(p_parent_id bigint, p_slug text)
returns text
language sql
stable
set search_path = ''
as $$
    select case
        when p_parent_id is null then p_slug
        else (select c.full_slug from products.categories c where c.id = p_parent_id) || '/' || p_slug
    end;
$$;

create or replace function products.categories_set_full_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.full_slug := products.category_compute_full_slug(new.parent_id, new.slug);
    return new;
end;
$$;

create or replace function products.categories_cascade_full_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.full_slug is distinct from old.full_slug then
        update products.categories
        set full_slug = products.category_compute_full_slug(new.id, slug)
        where parent_id = new.id;
    end if;
    return null;
end;
$$;

drop trigger if exists categories_set_full_slug on products.categories;
create trigger categories_set_full_slug
before insert or update of parent_id, slug on products.categories
for each row execute function products.categories_set_full_slug();

drop trigger if exists categories_cascade_full_slug on products.categories;
create trigger categories_cascade_full_slug
after update on products.categories
for each row execute function products.categories_cascade_full_slug();

alter table products.brands enable row level security;
alter table products.brands force row level security;
alter table products.categories enable row level security;
alter table products.categories force row level security;
alter table products.products enable row level security;
alter table products.products force row level security;
alter table products.product_variants enable row level security;
alter table products.product_variants force row level security;
alter table products.product_categories enable row level security;
alter table products.product_categories force row level security;
alter table products.attributes enable row level security;
alter table products.attributes force row level security;
alter table products.attribute_options enable row level security;
alter table products.attribute_options force row level security;
alter table products.category_attributes enable row level security;
alter table products.category_attributes force row level security;
alter table products.product_variant_axes enable row level security;
alter table products.product_variant_axes force row level security;
alter table products.product_variant_axis_options enable row level security;
alter table products.product_variant_axis_options force row level security;
alter table products.product_attribute_values enable row level security;
alter table products.product_attribute_values force row level security;
alter table products.variant_attribute_values enable row level security;
alter table products.variant_attribute_values force row level security;
alter table products.media enable row level security;
alter table products.media force row level security;
alter table products.product_media enable row level security;
alter table products.product_media force row level security;
alter table products.variant_media enable row level security;
alter table products.variant_media force row level security;
alter table products.external_references enable row level security;
alter table products.external_references force row level security;

revoke all on all tables in schema products from public;
revoke all on all tables in schema products from anon;
revoke all on all tables in schema products from authenticated;
revoke all on all sequences in schema products from public;
revoke all on all sequences in schema products from anon;
revoke all on all sequences in schema products from authenticated;
revoke all on all functions in schema products from public;
revoke all on all functions in schema products from anon;
revoke all on all functions in schema products from authenticated;

grant usage on schema products to service_role;
grant select, insert, update, delete on all tables in schema products to service_role;
grant usage, select on all sequences in schema products to service_role;
grant execute on all functions in schema products to service_role;

alter default privileges in schema products
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema products
grant usage, select on sequences to service_role;

alter default privileges in schema products
grant execute on functions to service_role;

comment on schema products is
    'Private products catalogue schema owned by Supabase Edge Functions.';
comment on table products.products is
    'Catalogue products without price, stock, seller, order, or payment state.';
comment on table products.product_variants is
    'Product variants. Future offers, inventory and orders should reference these rows.';
comment on table products.external_references is
    'Stable references for imports and future module interoperability.';

commit;
