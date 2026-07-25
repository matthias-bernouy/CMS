create table if not exists sales_configurator.proposal_items (
    id bigint generated always as identity primary key,
    proposal_version_id bigint not null
        references sales_configurator.proposal_versions(id) on delete cascade,
    parent_item_id bigint,
    catalog_item_id bigint
        references sales_configurator.catalog_items(id) on delete restrict,
    kind text not null,
    origin text not null,
    code text,
    label text not null,
    description text,
    quantity integer not null default 1,
    pricing_mode text not null,
    unit_amount_cents bigint,
    currency text not null default 'EUR',
    sort_order integer not null default 0,
    created_at timestamptz not null default pg_catalog.clock_timestamp(),
    constraint proposal_items_version_identity unique (id, proposal_version_id),
    constraint proposal_items_parent_same_version_fk
        foreign key (parent_item_id, proposal_version_id)
        references sales_configurator.proposal_items(id, proposal_version_id)
        on delete cascade,
    constraint proposal_items_not_own_parent check (id <> parent_item_id),
    constraint proposal_items_kind_valid check (
        kind in ('module', 'variant', 'feature', 'custom')
    ),
    constraint proposal_items_origin_valid check (
        origin in ('selected', 'included', 'requirement', 'custom')
    ),
    constraint proposal_items_code_bounded check (
        code is null or pg_catalog.length(code) <= 120
    ),
    constraint proposal_items_label_not_blank check (
        pg_catalog.length(pg_catalog.btrim(label)) > 0
        and pg_catalog.length(label) <= 300
    ),
    constraint proposal_items_description_bounded check (
        description is null or pg_catalog.length(description) <= 10000
    ),
    constraint proposal_items_quantity_valid check (quantity between 1 and 100000),
    constraint proposal_items_pricing_mode_valid check (
        pricing_mode in ('included', 'fixed', 'quote')
    ),
    constraint proposal_items_pricing_consistent check (
        (pricing_mode = 'fixed' and unit_amount_cents between 0 and 999999999999)
        or (pricing_mode in ('included', 'quote') and unit_amount_cents is null)
    ),
    constraint proposal_items_currency_eur check (currency = 'EUR'),
    constraint proposal_items_custom_consistent check (
        (
            kind = 'custom'
            and origin = 'custom'
            and catalog_item_id is null
            and pricing_mode = 'quote'
        )
        or (
            kind <> 'custom'
            and origin <> 'custom'
            and catalog_item_id is not null
        )
    )
);

create index if not exists proposal_items_version_sort_idx
    on sales_configurator.proposal_items(
        proposal_version_id,
        parent_item_id,
        sort_order,
        id
    );

create index if not exists proposal_items_catalog_item_id_idx
    on sales_configurator.proposal_items(catalog_item_id)
    where catalog_item_id is not null;
