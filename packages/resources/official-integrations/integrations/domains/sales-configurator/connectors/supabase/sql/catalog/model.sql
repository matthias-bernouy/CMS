create table if not exists sales_configurator.catalog_items (
    id bigint generated always as identity primary key,
    kind text not null,
    code text not null,
    name text not null,
    description text,
    status text not null default 'draft',
    sort_order integer not null default 0,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint catalog_items_kind_valid check (kind in ('module', 'variant', 'feature')),
    constraint catalog_items_code_not_blank check (pg_catalog.length(pg_catalog.btrim(code)) > 0),
    constraint catalog_items_code_normalized check (
        code = pg_catalog.lower(pg_catalog.btrim(code))
        and code ~ '^[a-z0-9][a-z0-9_-]{0,119}$'
    ),
    constraint catalog_items_code_unique unique (code),
    constraint catalog_items_name_not_blank check (pg_catalog.length(pg_catalog.btrim(name)) > 0),
    constraint catalog_items_name_bounded check (pg_catalog.length(name) <= 200),
    constraint catalog_items_description_bounded check (
        description is null or pg_catalog.length(description) <= 10000
    ),
    constraint catalog_items_status_valid check (status in ('draft', 'published', 'archived'))
);

create table if not exists sales_configurator.catalog_modules (
    item_id bigint primary key
        references sales_configurator.catalog_items(id) on delete cascade
);

create table if not exists sales_configurator.catalog_variants (
    item_id bigint primary key
        references sales_configurator.catalog_items(id) on delete cascade,
    module_item_id bigint not null
        references sales_configurator.catalog_modules(item_id) on delete restrict,
    provider_name text,
    pricing_mode text not null,
    unit_amount_cents bigint,
    currency text not null default 'EUR',
    constraint catalog_variants_distinct_module check (item_id <> module_item_id),
    constraint catalog_variants_provider_bounded check (
        provider_name is null or pg_catalog.length(provider_name) <= 200
    ),
    constraint catalog_variants_pricing_mode_valid check (pricing_mode in ('fixed', 'quote')),
    constraint catalog_variants_pricing_consistent check (
        (pricing_mode = 'fixed' and unit_amount_cents between 0 and 999999999999)
        or (pricing_mode = 'quote' and unit_amount_cents is null)
    ),
    constraint catalog_variants_currency_eur check (currency = 'EUR')
);

create index if not exists catalog_variants_module_item_id_idx
    on sales_configurator.catalog_variants(module_item_id);

create table if not exists sales_configurator.catalog_features (
    item_id bigint primary key
        references sales_configurator.catalog_items(id) on delete cascade
);

create table if not exists sales_configurator.variant_features (
    variant_item_id bigint not null
        references sales_configurator.catalog_variants(item_id) on delete cascade,
    feature_item_id bigint not null
        references sales_configurator.catalog_features(item_id) on delete restrict,
    availability text not null,
    pricing_mode text not null,
    unit_amount_cents bigint,
    sort_order integer not null default 0,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    updated_at timestamptz not null default pg_catalog.clock_timestamp(),
    primary key (variant_item_id, feature_item_id),
    constraint variant_features_availability_valid check (availability in ('included', 'optional')),
    constraint variant_features_pricing_mode_valid check (pricing_mode in ('included', 'fixed', 'quote')),
    constraint variant_features_pricing_consistent check (
        (
            availability = 'included'
            and pricing_mode = 'included'
            and unit_amount_cents is null
        )
        or (
            availability = 'optional'
            and pricing_mode = 'fixed'
            and unit_amount_cents between 0 and 999999999999
        )
        or (
            availability = 'optional'
            and pricing_mode = 'quote'
            and unit_amount_cents is null
        )
    )
);

create index if not exists variant_features_feature_item_id_idx
    on sales_configurator.variant_features(feature_item_id);

create table if not exists sales_configurator.catalog_requirements (
    subject_item_id bigint not null
        references sales_configurator.catalog_items(id) on delete cascade,
    required_item_id bigint not null
        references sales_configurator.catalog_items(id) on delete restrict,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    primary key (subject_item_id, required_item_id),
    constraint catalog_requirements_not_self check (subject_item_id <> required_item_id)
);

create index if not exists catalog_requirements_required_item_id_idx
    on sales_configurator.catalog_requirements(required_item_id);

drop trigger if exists catalog_items_set_updated_at on sales_configurator.catalog_items;
create trigger catalog_items_set_updated_at
before update on sales_configurator.catalog_items
for each row execute function sales_configurator.set_updated_at();

drop trigger if exists variant_features_set_updated_at on sales_configurator.variant_features;
create trigger variant_features_set_updated_at
before update on sales_configurator.variant_features
for each row execute function sales_configurator.set_updated_at();
