

-- ---------------------------------------------------------------------------
-- Checkout relay selections
-- ---------------------------------------------------------------------------
create table if not exists delivery.relay_selections (
    external_order_id text primary key,
    relay_location text not null,
    relay_country text not null,
    relay_number text not null,
    relay_name text not null,
    address_line1 text not null,
    address_line2 text not null default '',
    postal_code text not null,
    city text not null,
    latitude double precision,
    longitude double precision,
    weight_grams integer not null,
    shipping_amount bigint not null default 450,
    currency text not null default 'eur',
    selected_by text not null,
    snapshot jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint relay_selections_external_order_not_blank check (length(btrim(external_order_id)) > 0),
    constraint relay_selections_external_order_length check (length(external_order_id) <= 200),
    constraint relay_selections_location_format check (relay_location ~ '^[A-Z]{2}-[A-Za-z0-9]{1,20}$'),
    constraint relay_selections_country_format check (relay_country ~ '^[A-Z]{2}$'),
    constraint relay_selections_number_not_blank check (length(btrim(relay_number)) > 0),
    constraint relay_selections_name_not_blank check (length(btrim(relay_name)) > 0),
    constraint relay_selections_postal_code_not_blank check (length(btrim(postal_code)) > 0),
    constraint relay_selections_city_not_blank check (length(btrim(city)) > 0),
    constraint relay_selections_weight_positive check (weight_grams > 0),
    constraint relay_selections_shipping_amount_valid check (
        shipping_amount between 0 and 9007199254740991
    ),
    constraint relay_selections_currency_valid check (currency ~ '^[a-z]{3}$'),
    constraint relay_selections_selected_by_not_blank check (length(btrim(selected_by)) > 0),
    constraint relay_selections_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

alter table delivery.relay_selections
    add column if not exists shipping_amount bigint not null default 450;
alter table delivery.relay_selections
    add column if not exists currency text not null default 'eur';