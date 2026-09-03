

-- ---------------------------------------------------------------------------
-- Immutable delivery quotes
-- ---------------------------------------------------------------------------
create table if not exists delivery.delivery_quotes (
    quote_id text primary key,
    request_key text not null constraint delivery_quotes_request_key_key unique,
    external_order_id text not null,
    order_version integer not null,
    revision integer not null,
    selected_by text not null,
    selected_for_cms_user_id text not null,
    relay_location text not null,
    relay_country text not null,
    relay_number text not null,
    relay_name text not null,
    relay_address_line1 text not null,
    relay_address_line2 text not null default '',
    relay_postal_code text not null,
    relay_city text not null,
    relay_latitude double precision,
    relay_longitude double precision,
    weight_grams integer not null,
    shipping_amount bigint not null,
    currency text not null,
    merchandise_subtotal_minor_amount bigint not null,
    recipient_snapshot jsonb not null,
    seller_fulfillment_snapshot jsonb not null,
    relay_snapshot jsonb not null,
    request_snapshot jsonb not null,
    quoted_at timestamptz not null default now(),
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    constraint delivery_quotes_quote_id_format check (quote_id ~ '^mrq_[a-f0-9]{64}$'),
    constraint delivery_quotes_request_key_not_blank check (length(btrim(request_key)) > 0),
    constraint delivery_quotes_external_order_not_blank check (length(btrim(external_order_id)) > 0),
    constraint delivery_quotes_order_version_positive check (order_version > 0),
    constraint delivery_quotes_revision_positive check (revision > 0),
    constraint delivery_quotes_selected_by_not_blank check (length(btrim(selected_by)) > 0),
    constraint delivery_quotes_selected_for_not_blank check (length(btrim(selected_for_cms_user_id)) > 0),
    constraint delivery_quotes_relay_location_format check (relay_location ~ '^[A-Z]{2}-[A-Za-z0-9]{1,20}$'),
    constraint delivery_quotes_relay_country_fr check (relay_country = 'FR'),
    constraint delivery_quotes_relay_number_not_blank check (length(btrim(relay_number)) > 0),
    constraint delivery_quotes_relay_name_not_blank check (length(btrim(relay_name)) > 0),
    constraint delivery_quotes_relay_postal_code_fr check (relay_postal_code ~ '^[0-9]{5}$'),
    constraint delivery_quotes_relay_city_not_blank check (length(btrim(relay_city)) > 0),
    constraint delivery_quotes_weight_positive check (weight_grams > 0),
    constraint delivery_quotes_shipping_amount_valid check (shipping_amount between 0 and 9007199254740991),
    constraint delivery_quotes_merchandise_amount_valid check (
        merchandise_subtotal_minor_amount between 0 and 999999999
    ),
    constraint delivery_quotes_currency_eur check (currency = 'eur'),
    constraint delivery_quotes_snapshots_object check (
        jsonb_typeof(recipient_snapshot) = 'object'
        and jsonb_typeof(seller_fulfillment_snapshot) = 'object'
        and jsonb_typeof(relay_snapshot) = 'object'
        and jsonb_typeof(request_snapshot) = 'object'
    ),
    constraint delivery_quotes_expiry_after_quote check (expires_at > quoted_at),
    constraint delivery_quotes_order_revision_unique unique (external_order_id, revision)
);

create index if not exists delivery_quotes_order_created_idx
    on delivery.delivery_quotes(external_order_id, revision desc, created_at desc);

alter table delivery.shipments
    drop constraint if exists shipments_delivery_quote_fk;
alter table delivery.shipments
    add constraint shipments_delivery_quote_fk foreign key (delivery_quote_id)
    references delivery.delivery_quotes(quote_id) on delete restrict;

create index if not exists shipments_delivery_quote_idx
    on delivery.shipments(delivery_quote_id);
