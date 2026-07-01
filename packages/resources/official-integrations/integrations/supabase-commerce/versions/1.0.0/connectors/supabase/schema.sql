-- Supabase commerce schema for a CMS-backed catalogue (vendors, brands,
-- categories, products, variants, offers, taxonomy, attributes, media).
--
-- Run this SQL against the target Supabase database. The CMS must not query
-- these tables directly; the cms-commerce Edge Function owns all reads and
-- writes. Catalogue only: no payments, cart, orders, delivery, or Stripe.
--
-- Requires PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT, views WITH
-- security_invoker). Supabase satisfies this.

begin;

create schema if not exists commerce;

revoke all on schema commerce from public;
revoke all on schema commerce from anon;
revoke all on schema commerce from authenticated;

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------
create table if not exists commerce.vendors (
    id bigint generated always as identity primary key,
    slug text not null,
    name text not null,
    kind text not null default 'external',
    cms_user_id text,
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint vendors_slug_not_blank check (length(btrim(slug)) > 0),
    constraint vendors_slug_key unique (slug),
    constraint vendors_kind_valid check (kind in ('internal', 'external')),
    constraint vendors_status_valid check (status in ('active', 'inactive', 'pending', 'suspended')),
    constraint vendors_metadata_object check (jsonb_typeof(metadata) = 'object')
);

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table if not exists commerce.brands (
    id bigint generated always as identity primary key,
    slug text not null,
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint brands_slug_not_blank check (length(btrim(slug)) > 0),
    constraint brands_slug_key unique (slug)
);

-- ---------------------------------------------------------------------------
-- Categories (self-referential tree; full_slug maintained by triggers)
-- ---------------------------------------------------------------------------
create table if not exists commerce.categories (
    id bigint generated always as identity primary key,
    parent_id bigint references commerce.categories(id) on delete restrict,
    slug text not null,
    full_slug text not null,
    title text not null,
    description text,
    position integer not null default 0,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint categories_slug_not_blank check (length(btrim(slug)) > 0),
    constraint categories_slug_no_slash check (strpos(slug, '/') = 0),
    constraint categories_status_valid check (status in ('active', 'inactive', 'archived')),
    constraint categories_no_self_parent check (parent_id is null or parent_id <> id),
    constraint categories_full_slug_key unique (full_slug),
    constraint categories_parent_slug_key unique nulls not distinct (parent_id, slug)
);

-- ---------------------------------------------------------------------------
-- Products (single-locale text; full-text search_vector)
-- ---------------------------------------------------------------------------
create table if not exists commerce.products (
    id bigint generated always as identity primary key,
    slug text not null,
    title text not null,
    description text,
    brand_id bigint references commerce.brands(id) on delete set null,
    status text not null default 'draft',
    visibility text not null default 'public',
    metadata jsonb not null default '{}'::jsonb,
    search_vector tsvector generated always as (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint products_slug_not_blank check (length(btrim(slug)) > 0),
    constraint products_slug_key unique (slug),
    constraint products_status_valid check (status in ('draft', 'active', 'archived')),
    constraint products_visibility_valid check (visibility in ('public', 'hidden')),
    constraint products_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create table if not exists commerce.product_categories (
    id bigint generated always as identity primary key,
    product_id bigint not null references commerce.products(id) on delete cascade,
    category_id bigint not null references commerce.categories(id) on delete cascade,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    constraint product_categories_key unique (product_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Variants (every product has at least one; no price/stock here)
-- ---------------------------------------------------------------------------
create table if not exists commerce.product_variants (
    id bigint generated always as identity primary key,
    product_id bigint not null references commerce.products(id) on delete cascade,
    sku text,
    title text,
    is_default boolean not null default false,
    status text not null default 'active',
    position integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_variants_status_valid check (status in ('active', 'inactive', 'archived')),
    constraint product_variants_metadata_object check (jsonb_typeof(metadata) = 'object'),
    -- target for the offers composite foreign key
    constraint product_variants_id_product_key unique (id, product_id)
);

create unique index if not exists product_variants_sku_key
    on commerce.product_variants (product_id, sku) where sku is not null;
create unique index if not exists product_variants_default_key
    on commerce.product_variants (product_id) where is_default;

-- ---------------------------------------------------------------------------
-- Attributes and taxonomy
-- ---------------------------------------------------------------------------
create table if not exists commerce.attributes (
    id bigint generated always as identity primary key,
    code text not null,
    name text not null,
    description text,
    data_type text not null default 'text',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint attributes_code_not_blank check (length(btrim(code)) > 0),
    constraint attributes_code_key unique (code),
    constraint attributes_data_type_valid check (data_type in ('text', 'number', 'boolean', 'option'))
);

create table if not exists commerce.attribute_options (
    id bigint generated always as identity primary key,
    attribute_id bigint not null references commerce.attributes(id) on delete cascade,
    value text not null,
    label text,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    constraint attribute_options_value_not_blank check (length(btrim(value)) > 0),
    constraint attribute_options_key unique (attribute_id, value)
);

create table if not exists commerce.category_attributes (
    id bigint generated always as identity primary key,
    category_id bigint not null references commerce.categories(id) on delete cascade,
    attribute_id bigint not null references commerce.attributes(id) on delete cascade,
    is_filterable boolean not null default true,
    position integer not null default 0,
    constraint category_attributes_key unique (category_id, attribute_id)
);

create table if not exists commerce.product_variant_axes (
    id bigint generated always as identity primary key,
    product_id bigint not null references commerce.products(id) on delete cascade,
    attribute_id bigint not null references commerce.attributes(id) on delete restrict,
    position integer not null default 0,
    constraint product_variant_axes_key unique (product_id, attribute_id)
);

create table if not exists commerce.product_attribute_values (
    id bigint generated always as identity primary key,
    product_id bigint not null references commerce.products(id) on delete cascade,
    attribute_id bigint not null references commerce.attributes(id) on delete restrict,
    option_id bigint references commerce.attribute_options(id) on delete restrict,
    value_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint product_attribute_values_key unique (product_id, attribute_id),
    constraint product_attribute_values_value_present check (option_id is not null or value_text is not null)
);

create table if not exists commerce.variant_attribute_values (
    id bigint generated always as identity primary key,
    variant_id bigint not null references commerce.product_variants(id) on delete cascade,
    attribute_id bigint not null references commerce.attributes(id) on delete restrict,
    option_id bigint references commerce.attribute_options(id) on delete restrict,
    value_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint variant_attribute_values_key unique (variant_id, attribute_id),
    constraint variant_attribute_values_value_present check (option_id is not null or value_text is not null)
);

-- ---------------------------------------------------------------------------
-- Offers (the only place price, condition and stock live)
-- ---------------------------------------------------------------------------
create table if not exists commerce.offers (
    id bigint generated always as identity primary key,
    vendor_id bigint not null references commerce.vendors(id) on delete restrict,
    variant_id bigint not null references commerce.product_variants(id) on delete cascade,
    product_id bigint not null,
    price_amount_minor integer not null,
    compare_at_price_amount_minor integer,
    currency text not null default 'eur',
    condition text not null default 'new',
    stock_quantity integer not null default 0,
    stock_status text not null default 'in_stock',
    status text not null default 'active',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint offers_vendor_variant_key unique (vendor_id, variant_id),
    -- product_id must belong to the variant's product
    constraint offers_variant_product_fk foreign key (variant_id, product_id)
        references commerce.product_variants(id, product_id),
    constraint offers_price_non_negative check (price_amount_minor >= 0),
    constraint offers_compare_at_valid check (
        compare_at_price_amount_minor is null
        or compare_at_price_amount_minor >= price_amount_minor
    ),
    constraint offers_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint offers_condition_valid check (condition in ('new', 'used', 'refurbished')),
    constraint offers_stock_quantity_non_negative check (stock_quantity >= 0),
    constraint offers_stock_status_valid check (stock_status in ('in_stock', 'out_of_stock', 'preorder', 'backorder')),
    constraint offers_status_valid check (status in ('draft', 'active', 'inactive', 'archived')),
    constraint offers_metadata_object check (jsonb_typeof(metadata) = 'object')
);

-- ---------------------------------------------------------------------------
-- Media (CMS file or external URL) and link tables
-- ---------------------------------------------------------------------------
create table if not exists commerce.media (
    id bigint generated always as identity primary key,
    cms_file_id text,
    url text,
    alt text,
    mime_type text,
    width integer,
    height integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint media_source_present check (cms_file_id is not null or url is not null)
);

create unique index if not exists media_cms_file_id_key
    on commerce.media (cms_file_id) where cms_file_id is not null;
create unique index if not exists media_url_key
    on commerce.media (url) where url is not null;

create table if not exists commerce.product_media (
    id bigint generated always as identity primary key,
    product_id bigint not null references commerce.products(id) on delete cascade,
    media_id bigint not null references commerce.media(id) on delete cascade,
    sort_order integer not null default 0,
    is_main boolean not null default false,
    constraint product_media_key unique (product_id, media_id)
);
create unique index if not exists product_media_main_key
    on commerce.product_media (product_id) where is_main;

create table if not exists commerce.variant_media (
    id bigint generated always as identity primary key,
    variant_id bigint not null references commerce.product_variants(id) on delete cascade,
    media_id bigint not null references commerce.media(id) on delete cascade,
    sort_order integer not null default 0,
    is_main boolean not null default false,
    constraint variant_media_key unique (variant_id, media_id)
);
create unique index if not exists variant_media_main_key
    on commerce.variant_media (variant_id) where is_main;

-- ---------------------------------------------------------------------------
-- Interop and settings
-- ---------------------------------------------------------------------------
create table if not exists commerce.external_references (
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
create index if not exists external_references_entity_idx
    on commerce.external_references (entity_type, entity_id);

create table if not exists commerce.commerce_settings (
    id integer primary key,
    default_vendor_id bigint references commerce.vendors(id) on delete set null,
    currency text not null default 'eur',
    locale text not null default 'en',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint commerce_settings_singleton check (id = 1),
    constraint commerce_settings_currency_format check (currency = lower(currency) and length(currency) = 3),
    constraint commerce_settings_metadata_object check (jsonb_typeof(metadata) = 'object')
);

insert into commerce.commerce_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Secondary indexes for reads
-- ---------------------------------------------------------------------------
create index if not exists categories_parent_idx on commerce.categories (parent_id);
create index if not exists categories_status_idx on commerce.categories (status);
create index if not exists products_status_visibility_idx on commerce.products (status, visibility);
create index if not exists products_brand_idx on commerce.products (brand_id);
create index if not exists products_search_idx on commerce.products using gin (search_vector);
create index if not exists product_categories_category_idx on commerce.product_categories (category_id);
create index if not exists product_variants_product_idx on commerce.product_variants (product_id);
create index if not exists offers_variant_idx on commerce.offers (variant_id);
create index if not exists offers_product_idx on commerce.offers (product_id);
create index if not exists offers_vendor_idx on commerce.offers (vendor_id);
create index if not exists offers_status_stock_idx on commerce.offers (status, stock_status);
create index if not exists product_media_product_idx on commerce.product_media (product_id);
create index if not exists variant_media_variant_idx on commerce.variant_media (variant_id);
create index if not exists product_attribute_values_attr_idx on commerce.product_attribute_values (attribute_id, option_id);
create index if not exists variant_attribute_values_attr_idx on commerce.variant_attribute_values (attribute_id, option_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function commerce.set_updated_at()
returns trigger
language plpgsql
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
        'vendors', 'brands', 'categories', 'products', 'product_variants',
        'attributes', 'product_attribute_values', 'variant_attribute_values',
        'offers', 'media', 'external_references', 'commerce_settings'
    ]
    loop
        execute format('drop trigger if exists %I on commerce.%I', t || '_set_updated_at', t);
        execute format(
            'create trigger %I before update on commerce.%I for each row execute function commerce.set_updated_at()',
            t || '_set_updated_at', t
        );
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Category full_slug maintenance (DB owns full_slug; writers set parent_id+slug)
-- ---------------------------------------------------------------------------
create or replace function commerce.category_compute_full_slug(p_parent_id bigint, p_slug text)
returns text
language sql
stable
as $$
    select case
        when p_parent_id is null then p_slug
        else (select c.full_slug from commerce.categories c where c.id = p_parent_id) || '/' || p_slug
    end;
$$;

create or replace function commerce.categories_set_full_slug()
returns trigger
language plpgsql
as $$
begin
    new.full_slug := commerce.category_compute_full_slug(new.parent_id, new.slug);
    return new;
end;
$$;

create or replace function commerce.categories_cascade_full_slug()
returns trigger
language plpgsql
as $$
begin
    if new.full_slug is distinct from old.full_slug then
        update commerce.categories
        set full_slug = commerce.category_compute_full_slug(new.id, slug)
        where parent_id = new.id;
    end if;
    return null;
end;
$$;

drop trigger if exists categories_set_full_slug on commerce.categories;
create trigger categories_set_full_slug
before insert or update of parent_id, slug on commerce.categories
for each row execute function commerce.categories_set_full_slug();

drop trigger if exists categories_cascade_full_slug on commerce.categories;
create trigger categories_cascade_full_slug
after update on commerce.categories
for each row execute function commerce.categories_cascade_full_slug();

-- ---------------------------------------------------------------------------
-- Storefront read model: product listing view (per-product offer rollup)
-- security_invoker so the querying role (service_role, which bypasses RLS) is
-- used for the underlying tables instead of the view owner.
-- ---------------------------------------------------------------------------
create or replace view commerce.product_listing
with (security_invoker = true) as
select
    p.id as product_id,
    p.slug,
    p.title,
    p.description,
    p.brand_id,
    p.status,
    p.visibility,
    p.created_at,
    p.updated_at,
    min(o.price_amount_minor) as min_price_amount_minor,
    max(o.price_amount_minor) as max_price_amount_minor,
    coalesce(bool_or(o.stock_status = 'in_stock'), false) as in_stock,
    count(o.id) as active_offer_count
from commerce.products p
left join commerce.product_variants v on v.product_id = p.id and v.status = 'active'
left join commerce.offers o on o.variant_id = v.id and o.status = 'active'
group by p.id;

-- ---------------------------------------------------------------------------
-- RPC: product search (PostgREST cannot order parents by a child aggregate)
-- ---------------------------------------------------------------------------
create or replace function commerce.search_products(
    p_category_id bigint default null,
    p_category_full_slug text default null,
    p_brand_id bigint default null,
    p_vendor_id bigint default null,
    p_q text default null,
    p_min_price integer default null,
    p_max_price integer default null,
    p_stock_status text default null,
    p_condition text default null,
    p_status text default 'active',
    p_visibility text default 'public',
    p_sort text default 'created_at_desc',
    p_limit integer default 20,
    p_offset integer default 0,
    p_include_total boolean default false
)
returns jsonb
language plpgsql
volatile
as $$
declare
    v_category_id bigint := p_category_id;
    v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
    v_has_offer_filter boolean := (
        p_vendor_id is not null or p_condition is not null or p_stock_status is not null
        or p_min_price is not null or p_max_price is not null
    );
    v_items jsonb;
    v_total integer;
begin
    if v_category_id is null and p_category_full_slug is not null then
        select id into v_category_id from commerce.categories where full_slug = p_category_full_slug;
    end if;

    drop table if exists _commerce_search;
    create temporary table _commerce_search on commit drop as
    with base as (
        select
            p.id,
            p.slug,
            p.title,
            p.description,
            p.brand_id,
            p.status,
            p.visibility,
            p.created_at,
            min(o.price_amount_minor) as min_price_amount_minor,
            max(o.price_amount_minor) as max_price_amount_minor,
            coalesce(bool_or(o.stock_status = 'in_stock'), false) as in_stock,
            count(o.id) as active_offer_count
        from commerce.products p
        left join commerce.product_variants v
            on v.product_id = p.id and v.status = 'active'
        left join commerce.offers o
            on o.variant_id = v.id
            and o.status = 'active'
            and (p_vendor_id is null or o.vendor_id = p_vendor_id)
            and (p_condition is null or o.condition = p_condition)
            and (p_stock_status is null or o.stock_status = p_stock_status)
            and (p_min_price is null or o.price_amount_minor >= p_min_price)
            and (p_max_price is null or o.price_amount_minor <= p_max_price)
        where (p_status is null or p.status = p_status)
          and (p_visibility is null or p.visibility = p_visibility)
          and (p_brand_id is null or p.brand_id = p_brand_id)
          and (p_q is null or p.search_vector @@ websearch_to_tsquery('simple', p_q))
          and (
                v_category_id is null
                or exists (
                    select 1 from commerce.product_categories pc
                    where pc.product_id = p.id and pc.category_id = v_category_id
                )
            )
        group by p.id
        having (not v_has_offer_filter) or count(o.id) > 0
    )
    select * from base;

    select coalesce(jsonb_agg(item order by rn), '[]'::jsonb)
    into v_items
    from (
        select to_jsonb(pg) as item, row_number() over () as rn
        from (
            select * from _commerce_search
            order by
                case when p_sort = 'price_asc'  then min_price_amount_minor end asc nulls last,
                case when p_sort = 'price_desc' then min_price_amount_minor end desc nulls last,
                case when p_sort = 'name_asc'   then title end asc,
                case when p_sort = 'name_desc'  then title end desc,
                case when p_sort = 'created_at_asc' then created_at end asc,
                case when p_sort = 'created_at_desc' then created_at end desc,
                id desc
            limit v_limit offset v_offset
        ) pg
    ) z;

    if p_include_total then
        select count(*) into v_total from _commerce_search;
    end if;

    return jsonb_build_object(
        'items', v_items,
        'limit', v_limit,
        'offset', v_offset,
        'total', case when p_include_total then v_total else null end
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: category facets (aggregation → needs GROUP BY, not PostgREST)
-- ---------------------------------------------------------------------------
create or replace function commerce.category_facets(
    p_category_id bigint default null,
    p_category_full_slug text default null,
    p_brand_id bigint default null,
    p_vendor_id bigint default null,
    p_q text default null,
    p_min_price integer default null,
    p_max_price integer default null,
    p_stock_status text default null,
    p_condition text default null,
    p_status text default 'active',
    p_visibility text default 'public'
)
returns jsonb
language plpgsql
stable
as $$
declare
    v_category_id bigint := p_category_id;
    v_has_offer_filter boolean := (
        p_vendor_id is not null or p_condition is not null or p_stock_status is not null
        or p_min_price is not null or p_max_price is not null
    );
    v_result jsonb;
begin
    if v_category_id is null and p_category_full_slug is not null then
        select id into v_category_id from commerce.categories where full_slug = p_category_full_slug;
    end if;

    with matched as (
        select p.id, p.brand_id
        from commerce.products p
        where (p_status is null or p.status = p_status)
          and (p_visibility is null or p.visibility = p_visibility)
          and (p_brand_id is null or p.brand_id = p_brand_id)
          and (p_q is null or p.search_vector @@ websearch_to_tsquery('simple', p_q))
          and (
                v_category_id is null
                or exists (
                    select 1 from commerce.product_categories pc
                    where pc.product_id = p.id and pc.category_id = v_category_id
                )
            )
          and (
                not v_has_offer_filter
                or exists (
                    select 1
                    from commerce.product_variants v
                    join commerce.offers o on o.variant_id = v.id and o.status = 'active'
                    where v.product_id = p.id and v.status = 'active'
                      and (p_vendor_id is null or o.vendor_id = p_vendor_id)
                      and (p_condition is null or o.condition = p_condition)
                      and (p_stock_status is null or o.stock_status = p_stock_status)
                      and (p_min_price is null or o.price_amount_minor >= p_min_price)
                      and (p_max_price is null or o.price_amount_minor <= p_max_price)
                )
            )
    ),
    brand_facets as (
        select b.id, b.name, count(*) as count
        from matched m
        join commerce.brands b on b.id = m.brand_id
        group by b.id, b.name
    ),
    vendor_facets as (
        select ve.id, ve.name, count(distinct m.id) as count
        from matched m
        join commerce.product_variants v on v.product_id = m.id and v.status = 'active'
        join commerce.offers o on o.variant_id = v.id and o.status = 'active'
        join commerce.vendors ve on ve.id = o.vendor_id
        group by ve.id, ve.name
    ),
    price_range as (
        select min(o.price_amount_minor) as min_price, max(o.price_amount_minor) as max_price
        from matched m
        join commerce.product_variants v on v.product_id = m.id and v.status = 'active'
        join commerce.offers o on o.variant_id = v.id and o.status = 'active'
    ),
    option_values as (
        select pav.product_id, pav.attribute_id, pav.option_id
        from commerce.product_attribute_values pav
        where pav.option_id is not null
        union all
        select v.product_id, vav.attribute_id, vav.option_id
        from commerce.variant_attribute_values vav
        join commerce.product_variants v on v.id = vav.variant_id
        where vav.option_id is not null
    ),
    option_facets as (
        select a.id as attribute_id, a.code, a.name as attribute_name,
               ao.id as option_id, ao.value, ao.label, count(distinct m.id) as count
        from matched m
        join option_values ov on ov.product_id = m.id
        join commerce.attributes a on a.id = ov.attribute_id
        join commerce.attribute_options ao on ao.id = ov.option_id
        where v_category_id is null or exists (
            select 1 from commerce.category_attributes ca
            where ca.category_id = v_category_id and ca.attribute_id = a.id and ca.is_filterable
        )
        group by a.id, a.code, a.name, ao.id, ao.value, ao.label
    ),
    attribute_facets as (
        select attribute_id, code, attribute_name,
            jsonb_agg(
                jsonb_build_object('optionId', option_id, 'value', value, 'label', label, 'count', count)
                order by count desc, value
            ) as options
        from option_facets
        group by attribute_id, code, attribute_name
    )
    select jsonb_build_object(
        'brands', coalesce((
            select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', count) order by count desc, name)
            from brand_facets
        ), '[]'::jsonb),
        'vendors', coalesce((
            select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', count) order by count desc, name)
            from vendor_facets
        ), '[]'::jsonb),
        'attributes', coalesce((
            select jsonb_agg(jsonb_build_object('code', code, 'name', attribute_name, 'options', options) order by code)
            from attribute_facets
        ), '[]'::jsonb),
        'price', coalesce((
            select jsonb_build_object('min', min_price, 'max', max_price) from price_range
        ), jsonb_build_object('min', null, 'max', null))
    ) into v_result;

    return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: forced, no policies. service_role bypasses RLS.
-- ---------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array[
        'vendors', 'brands', 'categories', 'products', 'product_categories',
        'product_variants', 'attributes', 'attribute_options', 'category_attributes',
        'product_variant_axes', 'product_attribute_values', 'variant_attribute_values',
        'offers', 'media', 'product_media', 'variant_media', 'external_references',
        'commerce_settings'
    ]
    loop
        execute format('alter table commerce.%I enable row level security', t);
        execute format('alter table commerce.%I force row level security', t);
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: only service_role, mirroring the marketplace connector.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema commerce from public;
revoke all on all tables in schema commerce from anon;
revoke all on all tables in schema commerce from authenticated;
revoke all on all sequences in schema commerce from public;
revoke all on all sequences in schema commerce from anon;
revoke all on all sequences in schema commerce from authenticated;
revoke all on all functions in schema commerce from public;
revoke all on all functions in schema commerce from anon;
revoke all on all functions in schema commerce from authenticated;

grant usage on schema commerce to service_role;
grant select, insert, update, delete on all tables in schema commerce to service_role;
grant usage, select on all sequences in schema commerce to service_role;
grant execute on all functions in schema commerce to service_role;

alter default privileges in schema commerce
grant select, insert, update, delete on tables to service_role;
alter default privileges in schema commerce
grant usage, select on sequences to service_role;
alter default privileges in schema commerce
grant execute on functions to service_role;

comment on schema commerce is
    'Private commerce catalogue schema owned by the cms-commerce Edge Function.';
comment on table commerce.vendors is
    'Sellers. Mono-vendor uses one internal vendor referenced by commerce_settings.default_vendor_id.';
comment on table commerce.products is
    'Catalogue products; every product has at least one variant. No price or stock here.';
comment on table commerce.product_variants is
    'Sellable variants of a product; one may be the default. No price or stock here.';
comment on table commerce.offers is
    'Vendor commercialisation of a variant: price, condition and stock live only here.';
comment on table commerce.external_references is
    'Interop keys for idempotent imports and mapping to external systems (e.g. stripe-connect vendors).';
comment on table commerce.commerce_settings is
    'Singleton settings row (id = 1): default vendor, currency, locale.';

commit;
