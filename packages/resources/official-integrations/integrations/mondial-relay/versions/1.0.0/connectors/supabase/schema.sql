-- Supabase delivery schema for a CMS-backed Mondial Relay Connect connector.
--
-- Run this SQL against the target Supabase database. The CMS must not query
-- these tables directly; the cms-delivery Edge Function owns all reads, writes,
-- label proxying, and Mondial Relay Connect calls.

begin;

create schema if not exists delivery;

revoke all on schema delivery from public;
revoke all on schema delivery from anon;
revoke all on schema delivery from authenticated;

-- ---------------------------------------------------------------------------
-- Shipments
-- ---------------------------------------------------------------------------
create table if not exists delivery.shipments (
    id text primary key,
    external_order_id text,
    expedition_number text,
    tracking_number text,
    status text not null default 'created',
    label_url text,
    label_format text,
    tracking_url text,
    mode_collection text,
    mode_delivery text,
    collection_relay_country text,
    collection_relay_number text,
    delivery_relay_country text,
    delivery_relay_number text,
    sender_name text,
    sender_email text,
    sender_phone text,
    sender_address_line1 text,
    sender_address_line2 text,
    sender_address_line3 text,
    sender_address_line4 text,
    sender_postal_code text,
    sender_city text,
    sender_country text,
    recipient_name text not null,
    recipient_email text,
    recipient_phone text,
    recipient_address_line1 text,
    recipient_address_line2 text,
    recipient_address_line3 text,
    recipient_address_line4 text,
    recipient_postal_code text not null,
    recipient_city text not null,
    recipient_country text not null default 'FR',
    weight_grams integer not null,
    package_count integer not null default 1,
    length_cm integer,
    size_code text,
    insurance_level text,
    instructions text,
    latest_event_label text,
    latest_event_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    raw_request jsonb not null default '{}'::jsonb,
    raw_response jsonb not null default '{}'::jsonb,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint shipments_id_not_blank check (length(btrim(id)) > 0),
    constraint shipments_external_order_id_not_blank check (
        external_order_id is null or length(btrim(external_order_id)) > 0
    ),
    constraint shipments_expedition_number_not_blank check (
        expedition_number is null or length(btrim(expedition_number)) > 0
    ),
    constraint shipments_expedition_number_key unique (expedition_number),
    constraint shipments_status_valid check (
        status in ('created', 'label_ready', 'in_transit', 'delivered', 'incident', 'cancelled', 'unknown')
    ),
    constraint shipments_label_url_http check (
        label_url is null or label_url ~* '^https?://'
    ),
    constraint shipments_tracking_url_http check (
        tracking_url is null or tracking_url ~* '^https?://'
    ),
    constraint shipments_recipient_name_not_blank check (length(btrim(recipient_name)) > 0),
    constraint shipments_recipient_postal_code_not_blank check (length(btrim(recipient_postal_code)) > 0),
    constraint shipments_recipient_city_not_blank check (length(btrim(recipient_city)) > 0),
    constraint shipments_recipient_country_valid check (recipient_country ~ '^[A-Z]{2}$'),
    constraint shipments_sender_country_valid check (
        sender_country is null or sender_country ~ '^[A-Z]{2}$'
    ),
    constraint shipments_weight_positive check (weight_grams > 0),
    constraint shipments_package_count_positive check (package_count > 0),
    constraint shipments_length_positive check (length_cm is null or length_cm > 0),
    constraint shipments_metadata_object check (jsonb_typeof(metadata) = 'object'),
    constraint shipments_raw_request_object check (jsonb_typeof(raw_request) = 'object'),
    constraint shipments_raw_response_object check (jsonb_typeof(raw_response) = 'object')
);

create index if not exists shipments_external_order_id_idx
    on delivery.shipments(external_order_id)
    where external_order_id is not null;

create index if not exists shipments_status_created_at_idx
    on delivery.shipments(status, created_at desc);

create index if not exists shipments_created_at_idx
    on delivery.shipments(created_at desc);

-- ---------------------------------------------------------------------------
-- Operational settings
-- ---------------------------------------------------------------------------
create table if not exists delivery.settings (
    id text primary key default 'default',
    mode_collection text not null default 'CCC',
    mode_delivery text not null default '24R',
    sender_name text not null default '',
    sender_firstname text not null default '',
    sender_lastname text not null default '',
    sender_address_line1 text not null default '',
    sender_address_line2 text not null default '',
    sender_address_line3 text not null default '',
    sender_postal_code text not null default '',
    sender_city text not null default '',
    sender_country text not null default 'FR',
    sender_phone text not null default '',
    sender_mobile text not null default '',
    sender_email text not null default '',
    default_weight_grams integer not null default 500,
    default_package_count integer not null default 1,
    default_length_cm integer not null default 30,
    default_width_cm integer not null default 20,
    default_height_cm integer not null default 10,
    default_content text not null default 'Products',
    declared_currency text not null default 'EUR',
    connect_culture text not null default 'fr-FR',
    connect_version_api text not null default '1.0',
    connect_output_format text not null default '10x15',
    connect_output_type text not null default 'PdfUrl',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint settings_id_default check (id = 'default'),
    constraint settings_mode_collection_not_blank check (length(btrim(mode_collection)) > 0),
    constraint settings_mode_delivery_not_blank check (length(btrim(mode_delivery)) > 0),
    constraint settings_sender_country_valid check (sender_country ~ '^[A-Z]{2}$'),
    constraint settings_default_weight_positive check (default_weight_grams > 0),
    constraint settings_default_package_count_positive check (default_package_count > 0),
    constraint settings_default_length_positive check (default_length_cm > 0),
    constraint settings_default_width_positive check (default_width_cm > 0),
    constraint settings_default_height_positive check (default_height_cm > 0),
    constraint settings_declared_currency_valid check (declared_currency ~ '^[A-Z]{3}$'),
    constraint settings_connect_culture_not_blank check (length(btrim(connect_culture)) > 0),
    constraint settings_connect_version_api_not_blank check (length(btrim(connect_version_api)) > 0),
    constraint settings_connect_output_format_not_blank check (length(btrim(connect_output_format)) > 0),
    constraint settings_connect_output_type_not_blank check (length(btrim(connect_output_type)) > 0)
);

insert into delivery.settings (id)
values ('default')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tracking events
-- ---------------------------------------------------------------------------
create table if not exists delivery.shipment_events (
    id bigint generated always as identity primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    expedition_number text not null,
    event_label text not null,
    event_date date,
    event_time text,
    location text,
    relay_number text,
    relay_country text,
    raw_event jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint shipment_events_expedition_number_not_blank check (length(btrim(expedition_number)) > 0),
    constraint shipment_events_event_label_not_blank check (length(btrim(event_label)) > 0),
    constraint shipment_events_event_time_not_blank check (
        event_time is null or length(btrim(event_time)) > 0
    ),
    constraint shipment_events_relay_country_valid check (
        relay_country is null or relay_country ~ '^[A-Z]{2}$'
    ),
    constraint shipment_events_raw_event_object check (jsonb_typeof(raw_event) = 'object')
);

create index if not exists shipment_events_shipment_created_at_idx
    on delivery.shipment_events(shipment_id, created_at desc);

create index if not exists shipment_events_expedition_number_idx
    on delivery.shipment_events(expedition_number);

-- ---------------------------------------------------------------------------
-- Shared maintenance
-- ---------------------------------------------------------------------------
create or replace function delivery.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists shipments_set_updated_at on delivery.shipments;
create trigger shipments_set_updated_at
before update on delivery.shipments
for each row execute function delivery.set_updated_at();

drop trigger if exists settings_set_updated_at on delivery.settings;
create trigger settings_set_updated_at
before update on delivery.settings
for each row execute function delivery.set_updated_at();

alter table delivery.shipments enable row level security;
alter table delivery.shipments force row level security;
alter table delivery.settings enable row level security;
alter table delivery.settings force row level security;
alter table delivery.shipment_events enable row level security;
alter table delivery.shipment_events force row level security;
drop table if exists delivery.relay_points_cache;

revoke all on all tables in schema delivery from public;
revoke all on all tables in schema delivery from anon;
revoke all on all tables in schema delivery from authenticated;
revoke all on all sequences in schema delivery from public;
revoke all on all sequences in schema delivery from anon;
revoke all on all sequences in schema delivery from authenticated;
revoke all on all functions in schema delivery from public;
revoke all on all functions in schema delivery from anon;
revoke all on all functions in schema delivery from authenticated;

grant usage on schema delivery to service_role;
grant select, insert, update, delete on all tables in schema delivery to service_role;
grant usage, select on all sequences in schema delivery to service_role;
grant execute on all functions in schema delivery to service_role;

alter default privileges in schema delivery
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema delivery
grant usage, select on sequences to service_role;

alter default privileges in schema delivery
grant execute on functions to service_role;

comment on schema delivery is
    'Private delivery schema owned by Supabase Edge Functions.';
comment on table delivery.shipments is
    'Mondial Relay Connect shipments created through the CMS delivery source.';
comment on column delivery.shipments.external_order_id is
    'Optional external order id for future commerce or ERP integrations.';
comment on column delivery.shipments.expedition_number is
    'Mondial Relay Connect shipment number returned by shipment creation.';
comment on column delivery.shipments.label_url is
    'Latest label URL returned by Mondial Relay. The CMS should proxy labels through the source endpoint.';
comment on table delivery.settings is
    'Editable Mondial Relay delivery defaults used by the cms-delivery Edge Function.';
comment on column delivery.settings.id is
    'Single settings row. Keep the default id unless the connector is versioned for multiple profiles.';
comment on table delivery.shipment_events is
    'Normalized events stored for delivery shipments.';

commit;
