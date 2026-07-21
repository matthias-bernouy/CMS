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
    idempotency_key text,
    expedition_number text,
    tracking_number text,
    status text not null default 'created',
    last_error text,
    provider_call_started_at timestamptz,
    creation_manual_review_at timestamptz,
    cancellation_tracking_until timestamptz,
    seller_cms_user_id text,
    delivery_quote_id text,
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
    declared_value_minor_amount bigint not null default 0,
    declared_currency text not null default 'EUR',
    package_count integer not null default 1,
    length_cm integer,
    size_code text,
    insurance_level text,
    instructions text,
    latest_event_label text,
    latest_event_at timestamptz,
    tracking_checked_at timestamptz,
    tracking_next_attempt_at timestamptz,
    tracking_claimed_at timestamptz,
    tracking_claimed_by text,
    carrier_accepted_at timestamptz,
    arrived_at_pickup_point_at timestamptz,
    available_for_pickup_at timestamptz,
    recipient_handoff_at timestamptz,
    pickup_expired_at timestamptz,
    returning_to_sender_at timestamptz,
    returned_to_sender_at timestamptz,
    incident_at timestamptz,
    lost_at timestamptz,
    seller_handoff_declared_at timestamptz,
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
    constraint shipments_idempotency_key_not_blank check (
        idempotency_key is null or length(btrim(idempotency_key)) > 0
    ),
    constraint shipments_expedition_number_not_blank check (
        expedition_number is null or length(btrim(expedition_number)) > 0
    ),
    constraint shipments_expedition_number_key unique (expedition_number),
    constraint shipments_status_valid check (
        status in (
            'creating', 'created', 'label_ready', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup', 'collected_by_recipient',
            'pickup_expired', 'returning_to_sender', 'returned_to_sender', 'incident',
            'lost', 'cancelled_unscanned', 'cancelled', 'failed', 'unknown', 'manual_review'
        )
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
    constraint shipments_declared_value_valid check (
        declared_value_minor_amount between 0 and 999999999
    ),
    constraint shipments_declared_currency_eur check (declared_currency = 'EUR'),
    constraint shipments_single_parcel check (package_count = 1),
    constraint shipments_length_positive check (length_cm is null or length_cm > 0),
    constraint shipments_metadata_object check (jsonb_typeof(metadata) = 'object'),
    constraint shipments_raw_request_object check (jsonb_typeof(raw_request) = 'object'),
    constraint shipments_raw_response_object check (jsonb_typeof(raw_response) = 'object')
);

alter table delivery.shipments
    add column if not exists idempotency_key text;
alter table delivery.shipments
    add column if not exists last_error text;
alter table delivery.shipments
    add column if not exists provider_call_started_at timestamptz;
alter table delivery.shipments
    add column if not exists creation_manual_review_at timestamptz,
    add column if not exists cancellation_tracking_until timestamptz,
    add column if not exists seller_cms_user_id text,
    add column if not exists delivery_quote_id text,
    add column if not exists declared_value_minor_amount bigint not null default 0,
    add column if not exists declared_currency text not null default 'EUR';
alter table delivery.shipments
    add column if not exists tracking_checked_at timestamptz;
alter table delivery.shipments
    add column if not exists tracking_next_attempt_at timestamptz,
    add column if not exists tracking_claimed_at timestamptz,
    add column if not exists tracking_claimed_by text;
alter table delivery.shipments
    add column if not exists carrier_accepted_at timestamptz,
    add column if not exists arrived_at_pickup_point_at timestamptz,
    add column if not exists available_for_pickup_at timestamptz,
    add column if not exists recipient_handoff_at timestamptz,
    add column if not exists pickup_expired_at timestamptz,
    add column if not exists returning_to_sender_at timestamptz,
    add column if not exists returned_to_sender_at timestamptz,
    add column if not exists incident_at timestamptz,
    add column if not exists lost_at timestamptz,
    add column if not exists seller_handoff_declared_at timestamptz;

alter table delivery.shipments
    drop constraint if exists shipments_status_valid;
alter table delivery.shipments
    add constraint shipments_status_valid check (
        status in (
            'creating', 'created', 'label_ready', 'carrier_accepted', 'in_transit',
            'arrived_at_pickup_point', 'available_for_pickup', 'collected_by_recipient',
            'pickup_expired', 'returning_to_sender', 'returned_to_sender', 'incident',
            'lost', 'cancelled_unscanned', 'cancelled', 'failed', 'unknown', 'manual_review'
        )
    );

create index if not exists shipments_external_order_id_idx
    on delivery.shipments(external_order_id)
    where external_order_id is not null;

drop index if exists delivery.shipments_idempotency_key_unique;
create unique index shipments_idempotency_key_unique
    on delivery.shipments(idempotency_key);

create index if not exists shipments_status_created_at_idx
    on delivery.shipments(status, created_at desc);

create index if not exists shipments_tracking_due_idx
    on delivery.shipments(status, tracking_next_attempt_at, tracking_checked_at, created_at)
    where expedition_number is not null;

create index if not exists shipments_created_at_idx
    on delivery.shipments(created_at desc);

create index if not exists shipments_creation_manual_review_idx
    on delivery.shipments(creation_manual_review_at desc, created_at, id)
    where status = 'unknown';

-- ---------------------------------------------------------------------------
-- Immutable delivery quotes
-- ---------------------------------------------------------------------------
create table if not exists delivery.delivery_quotes (
    quote_id text primary key,
    request_key text not null unique,
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

create or replace function delivery.reserve_delivery_quote(
    p_quote_id text,
    p_request_key text,
    p_external_order_id text,
    p_order_version integer,
    p_selected_by text,
    p_selected_for_cms_user_id text,
    p_relay_location text,
    p_relay_country text,
    p_relay_number text,
    p_relay_name text,
    p_relay_address_line1 text,
    p_relay_address_line2 text,
    p_relay_postal_code text,
    p_relay_city text,
    p_relay_latitude double precision,
    p_relay_longitude double precision,
    p_weight_grams integer,
    p_shipping_amount bigint,
    p_currency text,
    p_merchandise_subtotal_minor_amount bigint,
    p_recipient_snapshot jsonb,
    p_seller_fulfillment_snapshot jsonb,
    p_relay_snapshot jsonb,
    p_request_snapshot jsonb,
    p_ttl_seconds integer default 900
)
returns delivery.delivery_quotes
language plpgsql
set search_path = ''
as $$
declare
    v_existing delivery.delivery_quotes%rowtype;
    v_revision integer;
begin
    perform pg_advisory_xact_lock(hashtextextended('delivery-quote-request:' || p_request_key, 0));
    select * into v_existing from delivery.delivery_quotes where request_key = p_request_key;
    if found then
        if v_existing.quote_id <> p_quote_id
            or v_existing.external_order_id <> p_external_order_id
            or v_existing.order_version <> p_order_version
            or v_existing.selected_by <> p_selected_by
            or v_existing.selected_for_cms_user_id <> p_selected_for_cms_user_id
            or v_existing.request_snapshot <> p_request_snapshot then
            raise exception 'conflict: delivery quote request replay changed immutable input';
        end if;
        return v_existing;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('delivery-quote-order:' || p_external_order_id, 0));
    select coalesce(max(revision), 0) + 1 into v_revision
    from delivery.delivery_quotes where external_order_id = p_external_order_id;
    insert into delivery.delivery_quotes (
        quote_id, request_key, external_order_id, order_version, revision,
        selected_by, selected_for_cms_user_id,
        relay_location, relay_country, relay_number, relay_name,
        relay_address_line1, relay_address_line2, relay_postal_code, relay_city,
        relay_latitude, relay_longitude, weight_grams, shipping_amount, currency,
        merchandise_subtotal_minor_amount, recipient_snapshot,
        seller_fulfillment_snapshot, relay_snapshot, request_snapshot, expires_at
    ) values (
        p_quote_id, p_request_key, p_external_order_id, p_order_version, v_revision,
        p_selected_by, p_selected_for_cms_user_id,
        p_relay_location, p_relay_country, p_relay_number, p_relay_name,
        p_relay_address_line1, coalesce(p_relay_address_line2, ''), p_relay_postal_code, p_relay_city,
        p_relay_latitude, p_relay_longitude, p_weight_grams, p_shipping_amount, lower(p_currency),
        p_merchandise_subtotal_minor_amount, p_recipient_snapshot,
        p_seller_fulfillment_snapshot, p_relay_snapshot, p_request_snapshot,
        now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 900), 60), 3600))
    ) returning * into v_existing;
    return v_existing;
end;
$$;

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

create or replace function delivery.enforce_relay_selection_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if exists (
        select 1 from delivery.shipments shipment
        where shipment.external_order_id = old.external_order_id
    ) and (
        new.relay_location is distinct from old.relay_location
        or new.relay_country is distinct from old.relay_country
        or new.relay_number is distinct from old.relay_number
        or new.address_line1 is distinct from old.address_line1
        or new.address_line2 is distinct from old.address_line2
        or new.postal_code is distinct from old.postal_code
        or new.city is distinct from old.city
        or new.weight_grams is distinct from old.weight_grams
    ) then
        raise exception 'conflict: relay selection is already bound to a shipment';
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_relay_selection_binding on delivery.relay_selections;
create trigger enforce_relay_selection_binding
before update on delivery.relay_selections
for each row execute function delivery.enforce_relay_selection_binding();

create or replace function delivery.enforce_shipment_relay_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_relay_location text;
    v_weight_grams integer;
begin
    if new.delivery_quote_id is not null then
        select quote.relay_location, quote.weight_grams
        into v_relay_location, v_weight_grams
        from delivery.delivery_quotes quote
        where quote.quote_id = new.delivery_quote_id;
        if not found then
            raise exception 'conflict: shipment delivery quote does not exist';
        end if;
        if new.external_order_id !~ '^claim-return:[1-9][0-9]*$'
            and (new.delivery_relay_number is distinct from v_relay_location
                or new.weight_grams is distinct from v_weight_grams)
        then
            raise exception 'conflict: shipment does not match the immutable delivery quote';
        end if;
        return new;
    end if;
    select selection.relay_location, selection.weight_grams into v_relay_location, v_weight_grams
    from delivery.relay_selections selection
    where selection.external_order_id = new.external_order_id;
    if found and new.delivery_relay_number is distinct from v_relay_location then
        raise exception 'conflict: shipment relay does not match the server selection';
    end if;
    return new;
end;
$$;

drop trigger if exists enforce_shipment_relay_binding on delivery.shipments;
create trigger enforce_shipment_relay_binding
before insert on delivery.shipments
for each row execute function delivery.enforce_shipment_relay_binding();

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
    default_shipping_amount bigint not null default 450,
    declared_currency text not null default 'EUR',
    connect_culture text not null default 'fr-FR',
    connect_version_api text not null default '1.0',
    connect_output_format text not null default '10x15',
    connect_output_type text not null default 'PdfUrl',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint settings_id_default check (id = 'default'),
    constraint settings_mode_collection_24r check (mode_collection = 'CCC'),
    constraint settings_mode_delivery_24r check (mode_delivery = '24R'),
    constraint settings_sender_country_fr check (sender_country = 'FR'),
    constraint settings_default_weight_positive check (default_weight_grams > 0),
    constraint settings_single_parcel check (default_package_count = 1),
    constraint settings_default_length_positive check (default_length_cm > 0),
    constraint settings_default_width_positive check (default_width_cm > 0),
    constraint settings_default_height_positive check (default_height_cm > 0),
    constraint settings_default_shipping_amount_valid check (
        default_shipping_amount between 0 and 9007199254740991
    ),
    constraint settings_declared_currency_eur check (declared_currency = 'EUR'),
    constraint settings_connect_culture_not_blank check (length(btrim(connect_culture)) > 0),
    constraint settings_connect_version_api_not_blank check (length(btrim(connect_version_api)) > 0),
    constraint settings_connect_output_format_not_blank check (length(btrim(connect_output_format)) > 0),
    constraint settings_connect_output_type_not_blank check (length(btrim(connect_output_type)) > 0)
);

alter table delivery.settings
    add column if not exists default_shipping_amount bigint not null default 450;

insert into delivery.settings (id)
values ('default')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tracking events
-- ---------------------------------------------------------------------------
create table if not exists delivery.shipment_events (
    id bigint generated always as identity primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    order_public_id text not null,
    expedition_number text not null,
    event_label text not null,
    event_date date,
    event_time text,
    provider_event_key text,
    normalized_status text,
    occurred_at timestamptz,
    commerce_projected_at timestamptz,
    projection_status text not null default 'pending',
    projection_attempts integer not null default 0,
    projection_next_attempt_at timestamptz not null default now(),
    projection_claimed_at timestamptz,
    projection_claimed_by text,
    projection_claim_token uuid,
    projection_last_error text,
    projection_manual_review_at timestamptz,
    location text,
    relay_number text,
    relay_country text,
    raw_event jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint shipment_events_expedition_number_not_blank check (length(btrim(expedition_number)) > 0),
    constraint shipment_events_order_public_id_not_blank check (length(btrim(order_public_id)) > 0),
    constraint shipment_events_event_label_not_blank check (length(btrim(event_label)) > 0),
    constraint shipment_events_provider_event_key_not_blank check (
        provider_event_key is null or length(btrim(provider_event_key)) > 0
    ),
    constraint shipment_events_provider_event_key_unique unique (shipment_id, provider_event_key),
    constraint shipment_events_normalized_status_valid check (
        normalized_status is null or normalized_status in (
            'carrier_accepted', 'in_transit', 'arrived_at_pickup_point',
            'available_for_pickup', 'collected_by_recipient', 'pickup_expired',
            'returning_to_sender', 'returned_to_sender', 'incident', 'lost'
        )
    ),
    constraint shipment_events_event_time_not_blank check (
        event_time is null or length(btrim(event_time)) > 0
    ),
    constraint shipment_events_relay_country_valid check (
        relay_country is null or relay_country ~ '^[A-Z]{2}$'
    ),
    constraint shipment_events_raw_event_object check (jsonb_typeof(raw_event) = 'object'),
    constraint shipment_events_projection_status_valid check (
        projection_status in ('pending', 'processing', 'retry_wait', 'projected', 'manual_review')
    ),
    constraint shipment_events_projection_attempts_valid check (projection_attempts between 0 and 100),
    constraint shipment_events_projection_claim_consistent check (
        (projection_status = 'processing' and projection_claimed_at is not null
            and projection_claimed_by is not null and projection_claim_token is not null)
        or (projection_status <> 'processing' and projection_claimed_at is null
            and projection_claimed_by is null and projection_claim_token is null)
    )
);

alter table delivery.shipment_events
    add column if not exists provider_event_key text;
alter table delivery.shipment_events
    add column if not exists normalized_status text,
    add column if not exists occurred_at timestamptz,
    add column if not exists order_public_id text,
    add column if not exists commerce_projected_at timestamptz;
alter table delivery.shipment_events
    add column if not exists projection_status text not null default 'pending',
    add column if not exists projection_attempts integer not null default 0,
    add column if not exists projection_next_attempt_at timestamptz not null default now(),
    add column if not exists projection_claimed_at timestamptz,
    add column if not exists projection_claimed_by text,
    add column if not exists projection_claim_token uuid,
    add column if not exists projection_last_error text,
    add column if not exists projection_manual_review_at timestamptz;

update delivery.shipment_events
set projection_status = 'projected', projection_next_attempt_at = now()
where commerce_projected_at is not null and projection_status <> 'projected';

alter table delivery.shipment_events
    drop constraint if exists shipment_events_projection_status_valid,
    drop constraint if exists shipment_events_projection_attempts_valid,
    drop constraint if exists shipment_events_projection_claim_consistent;
alter table delivery.shipment_events
    add constraint shipment_events_projection_status_valid check (
        projection_status in ('pending', 'processing', 'retry_wait', 'projected', 'manual_review')
    ),
    add constraint shipment_events_projection_attempts_valid check (projection_attempts between 0 and 100),
    add constraint shipment_events_projection_claim_consistent check (
        (projection_status = 'processing' and projection_claimed_at is not null
            and projection_claimed_by is not null and projection_claim_token is not null)
        or (projection_status <> 'processing' and projection_claimed_at is null
            and projection_claimed_by is null and projection_claim_token is null)
    );

create unique index if not exists shipment_events_provider_event_key_unique
    on delivery.shipment_events(shipment_id, provider_event_key);

create index if not exists shipment_events_shipment_created_at_idx
    on delivery.shipment_events(shipment_id, created_at desc);

create index if not exists shipment_events_expedition_number_idx
    on delivery.shipment_events(expedition_number);

drop index if exists delivery.shipment_events_pending_commerce_idx;
create index shipment_events_pending_commerce_idx
    on delivery.shipment_events(projection_next_attempt_at, created_at, id)
    where normalized_status is not null and commerce_projected_at is null
        and projection_status in ('pending', 'retry_wait');

create index if not exists shipment_events_projection_manual_review_idx
    on delivery.shipment_events(projection_manual_review_at desc, id)
    where projection_status = 'manual_review';

create or replace function delivery.claim_pending_shipment_events(
    p_worker_id text,
    p_limit integer default 12,
    p_lease_seconds integer default 300,
    p_max_attempts integer default 5
)
returns setof jsonb
language plpgsql
set search_path = ''
as $$
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: worker id is required';
    end if;
    if p_limit < 1 or p_limit > 24 or p_lease_seconds < 30 or p_lease_seconds > 3600
        or p_max_attempts < 1 or p_max_attempts > 20 then
        raise exception 'validation: invalid projection claim settings';
    end if;

    update delivery.shipment_events event
    set projection_status = case when event.projection_attempts >= p_max_attempts then 'manual_review' else 'retry_wait' end,
        projection_next_attempt_at = now(),
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = left(coalesce(event.projection_last_error || '; ', '') || 'projection lease expired before acknowledgement', 2000),
        projection_manual_review_at = case when event.projection_attempts >= p_max_attempts then now() else event.projection_manual_review_at end
    where event.projection_status = 'processing'
      and event.projection_claimed_at < now() - make_interval(secs => p_lease_seconds);

    return query
    with candidates as materialized (
        select event.id
        from delivery.shipment_events event
        where event.normalized_status is not null
          and event.commerce_projected_at is null
          and event.projection_status in ('pending', 'retry_wait')
          and event.projection_next_attempt_at <= now()
          and event.projection_attempts < p_max_attempts
          and not exists (
              select 1 from delivery.shipment_events predecessor
              where predecessor.shipment_id = event.shipment_id
                and predecessor.normalized_status is not null
                and predecessor.commerce_projected_at is null
                and predecessor.id <> event.id
                and (
                    coalesce(predecessor.occurred_at, predecessor.created_at),
                    predecessor.created_at, predecessor.id
                ) < (
                    coalesce(event.occurred_at, event.created_at),
                    event.created_at, event.id
                )
          )
        order by coalesce(event.occurred_at, event.created_at), event.created_at, event.id
        for update skip locked
        limit p_limit
    ), claimed as (
        update delivery.shipment_events event
        set projection_status = 'processing',
            projection_attempts = event.projection_attempts + 1,
            projection_claimed_at = now(),
            projection_claimed_by = p_worker_id,
            projection_claim_token = gen_random_uuid(),
            projection_last_error = null
        from candidates
        where event.id = candidates.id
        returning event.*
    )
    select to_jsonb(claimed) from claimed order by claimed.created_at, claimed.id;
end;
$$;

create or replace function delivery.complete_shipment_event_projection(
    p_event_id bigint,
    p_claim_token uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    v_updated bigint;
begin
    update delivery.shipment_events
    set commerce_projected_at = now(),
        projection_status = 'projected',
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = null,
        projection_manual_review_at = null
    where id = p_event_id and projection_status = 'processing'
      and projection_claim_token = p_claim_token and commerce_projected_at is null
    returning id into v_updated;
    return v_updated is not null;
end;
$$;

create or replace function delivery.fail_shipment_event_projection(
    p_event_id bigint,
    p_claim_token uuid,
    p_error text,
    p_retry_delay_seconds integer default 60,
    p_max_attempts integer default 5
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_event delivery.shipment_events%rowtype;
begin
    if p_error is null or length(btrim(p_error)) = 0 or p_retry_delay_seconds < 1
        or p_retry_delay_seconds > 86400 or p_max_attempts < 1 or p_max_attempts > 20 then
        raise exception 'validation: invalid projection failure';
    end if;
    select * into v_event from delivery.shipment_events
    where id = p_event_id for update;
    if not found then raise exception 'not_found: shipment event'; end if;
    if v_event.projection_status = 'projected' and v_event.commerce_projected_at is not null then
        return to_jsonb(v_event);
    end if;
    if v_event.projection_status <> 'processing' or v_event.projection_claim_token is distinct from p_claim_token then
        raise exception 'conflict: shipment event projection lease mismatch';
    end if;
    update delivery.shipment_events
    set projection_status = case when v_event.projection_attempts >= p_max_attempts then 'manual_review' else 'retry_wait' end,
        projection_next_attempt_at = case when v_event.projection_attempts >= p_max_attempts
            then projection_next_attempt_at else now() + make_interval(secs => p_retry_delay_seconds) end,
        projection_claimed_at = null,
        projection_claimed_by = null,
        projection_claim_token = null,
        projection_last_error = left(btrim(p_error), 2000),
        projection_manual_review_at = case when v_event.projection_attempts >= p_max_attempts then now() else null end
    where id = p_event_id
    returning * into v_event;
    return to_jsonb(v_event);
end;
$$;

-- ---------------------------------------------------------------------------
-- Short-lived seller label capabilities
-- ---------------------------------------------------------------------------
create table if not exists delivery.label_access_tokens (
    token_hash text primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    seller_cms_user_id text not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    constraint label_access_tokens_hash_not_blank check (length(btrim(token_hash)) > 0),
    constraint label_access_tokens_seller_not_blank check (length(btrim(seller_cms_user_id)) > 0),
    constraint label_access_tokens_expiry_future check (expires_at > created_at)
);

create index if not exists label_access_tokens_expiry_idx
    on delivery.label_access_tokens(expires_at);
create index if not exists label_access_tokens_shipment_idx
    on delivery.label_access_tokens(shipment_id);

create or replace function delivery.declare_seller_handoff(
    p_external_order_id text,
    p_seller_cms_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_actor text := nullif(pg_catalog.btrim(p_seller_cms_user_id), '');
    v_shipment delivery.shipments%rowtype;
begin
    if v_actor is null then
        raise exception 'validation: seller CMS user id is required';
    end if;
    select shipment.* into v_shipment
    from delivery.shipments shipment
    where shipment.external_order_id = p_external_order_id
      and shipment.seller_cms_user_id = v_actor
    limit 1
    for update;
    if not found then
        raise exception 'not_found: shipment not found';
    end if;
    if v_shipment.seller_handoff_declared_at is null then
        if v_shipment.carrier_accepted_at is not null
            or v_shipment.status <> 'label_ready' then
            raise exception 'conflict: seller handoff cannot be declared for the current shipment state';
        end if;
        update delivery.shipments shipment set
            seller_handoff_declared_at = pg_catalog.now()
        where shipment.id = v_shipment.id
          and shipment.status = 'label_ready'
          and shipment.carrier_accepted_at is null
          and shipment.seller_handoff_declared_at is null
        returning shipment.* into v_shipment;
        if not found then
            raise exception 'conflict: shipment state changed while declaring seller handoff';
        end if;
    end if;
    return pg_catalog.jsonb_build_object(
        'id', v_shipment.id,
        'external_order_id', v_shipment.external_order_id,
        'expedition_number', v_shipment.expedition_number,
        'status', v_shipment.status,
        'carrier_accepted_at', v_shipment.carrier_accepted_at,
        'recipient_handoff_at', v_shipment.recipient_handoff_at,
        'seller_handoff_declared_at', v_shipment.seller_handoff_declared_at
    );
end;
$$;

revoke execute on function delivery.declare_seller_handoff(text, text)
    from public, anon, authenticated;
grant execute on function delivery.declare_seller_handoff(text, text)
    to service_role;

create or replace function delivery.issue_label_access_token(
    p_external_order_id text,
    p_seller_cms_user_id text,
    p_token_hash text,
    p_expires_at timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_shipment delivery.shipments%rowtype;
    v_token delivery.label_access_tokens%rowtype;
begin
    if p_seller_cms_user_id is null or length(btrim(p_seller_cms_user_id)) = 0
        or p_token_hash !~ '^[a-f0-9]{64}$'
        or p_expires_at is null or p_expires_at <= now() then
        raise exception 'validation: invalid label capability';
    end if;
    select * into v_shipment from delivery.shipments
    where external_order_id = p_external_order_id for update;
    if not found then raise exception 'not_found: shipment'; end if;
    if v_shipment.seller_cms_user_id is distinct from p_seller_cms_user_id then
        raise exception 'not_found: shipment';
    end if;
    if v_shipment.status <> 'label_ready'
        or v_shipment.carrier_accepted_at is not null then
        raise exception 'conflict: the shipment label is not available';
    end if;
    insert into delivery.label_access_tokens (
        token_hash, shipment_id, seller_cms_user_id, expires_at
    ) values (
        p_token_hash, v_shipment.id, p_seller_cms_user_id, p_expires_at
    ) returning * into v_token;
    return to_jsonb(v_token);
end;
$$;

create or replace function delivery.cancel_shipment_unscanned(
    p_external_order_id text,
    p_tracking_until timestamptz
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_shipment delivery.shipments%rowtype;
begin
    select * into v_shipment from delivery.shipments
    where external_order_id = p_external_order_id for update;
    if not found then raise exception 'not_found: shipment'; end if;
    if v_shipment.status in ('cancelled_unscanned', 'cancelled') then
        if p_tracking_until is distinct from v_shipment.cancellation_tracking_until then
            raise exception 'conflict: cancellation replay changed the tracking deadline';
        end if;
        return to_jsonb(v_shipment) || jsonb_build_object('idempotentReplay', true);
    end if;
    if p_tracking_until is null or p_tracking_until <= now() then
        raise exception 'validation: cancellation tracking deadline must be in the future';
    end if;
    if v_shipment.tracking_claimed_at is not null
        and v_shipment.tracking_claimed_at > now() - interval '20 minutes' then
        raise exception 'conflict: active carrier reconciliation prevents cancellation';
    end if;
    if v_shipment.seller_handoff_declared_at is not null or v_shipment.carrier_accepted_at is not null
        or v_shipment.status not in ('created', 'label_ready', 'failed') then
        raise exception 'conflict: shipment can no longer be cancelled before carrier reconciliation';
    end if;
    update delivery.shipments set
        status = 'cancelled_unscanned', cancellation_tracking_until = p_tracking_until,
        tracking_next_attempt_at = now(), tracking_claimed_at = null,
        tracking_claimed_by = null, last_error = null
    where id = v_shipment.id returning * into v_shipment;
    update delivery.label_access_tokens set revoked_at = coalesce(revoked_at, now())
    where shipment_id = v_shipment.id and revoked_at is null;
    return to_jsonb(v_shipment) || jsonb_build_object('idempotentReplay', false);
end;
$$;

create or replace function delivery.get_projection_health()
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'checkedAt', now(),
    'pendingProjectionCount', (
        select count(*) from delivery.shipment_events event
        where event.normalized_status is not null and event.commerce_projected_at is null
          and event.projection_status in ('pending', 'processing', 'retry_wait')
    ),
    'manualReviewCount',
        (select count(*) from delivery.shipment_events event where event.projection_status = 'manual_review')
        + (select count(*) from delivery.shipments shipment where shipment.status in ('unknown', 'manual_review')),
    'trackingErrorCount', (
        select count(*) from delivery.shipments shipment
        where shipment.last_error is not null
          and shipment.status in (
              'created', 'label_ready', 'carrier_accepted', 'in_transit',
              'arrived_at_pickup_point', 'available_for_pickup', 'incident',
              'pickup_expired', 'returning_to_sender', 'cancelled_unscanned'
          )
    ),
    'orders', coalesce((
        select jsonb_agg(jsonb_build_object(
            'externalOrderId', shipment.external_order_id,
            'shipmentId', shipment.id,
            'providerReference', shipment.expedition_number,
            'shipmentStatus', shipment.status,
            'pendingProjectionCount', (
                select count(*) from delivery.shipment_events event
                where event.shipment_id = shipment.id
                  and event.normalized_status is not null
                  and event.commerce_projected_at is null
                  and event.projection_status in ('pending', 'processing', 'retry_wait')
            ),
            'manualReviewCount',
                case when shipment.status in ('unknown', 'manual_review') then 1 else 0 end
                + (select count(*) from delivery.shipment_events event
                    where event.shipment_id = shipment.id
                      and event.projection_status = 'manual_review'),
            'trackingErrorCount', case
                when shipment.last_error is not null and shipment.status in (
                    'created', 'label_ready', 'carrier_accepted', 'in_transit',
                    'arrived_at_pickup_point', 'available_for_pickup', 'incident',
                    'pickup_expired', 'returning_to_sender', 'cancelled_unscanned'
                ) then 1 else 0 end,
            'trackingCheckedAt', shipment.tracking_checked_at
        ) order by shipment.created_at, shipment.id)
        from delivery.shipments shipment
        where shipment.external_order_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ), '[]'::jsonb)
);
$$;

create table if not exists delivery.shipment_recovery_events (
    id bigint generated always as identity primary key,
    shipment_id text not null references delivery.shipments(id) on delete cascade,
    actor_cms_user_id text not null,
    reason text not null,
    previous_status text not null,
    expedition_number text not null,
    created_at timestamptz not null default now(),
    constraint shipment_recovery_actor_not_blank check (length(btrim(actor_cms_user_id)) > 0),
    constraint shipment_recovery_reason_not_blank check (length(btrim(reason)) > 0),
    constraint shipment_recovery_expedition_not_blank check (length(btrim(expedition_number)) > 0)
);

create index if not exists shipment_recovery_events_shipment_idx
    on delivery.shipment_recovery_events(shipment_id);

create table if not exists delivery.projection_review_actions (
    id bigint generated always as identity primary key,
    shipment_event_id bigint not null references delivery.shipment_events(id) on delete restrict,
    action text not null,
    actor_cms_user_id text not null,
    reason text not null,
    previous_status text not null,
    resulting_status text not null,
    created_at timestamptz not null default now(),
    constraint projection_review_actions_action check (action in ('requeue', 'resolve_duplicate')),
    constraint projection_review_actions_actor check (length(btrim(actor_cms_user_id)) > 0),
    constraint projection_review_actions_reason check (length(btrim(reason)) >= 8)
);

create index if not exists projection_review_actions_event_idx
    on delivery.projection_review_actions(shipment_event_id, created_at desc);

create or replace function delivery.review_shipment_event_projection(
    p_event_id bigint,
    p_action text,
    p_actor_cms_user_id text,
    p_reason text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_event delivery.shipment_events%rowtype;
    v_previous_status text;
begin
    if p_action not in ('requeue', 'resolve_duplicate')
        or p_actor_cms_user_id is null or length(btrim(p_actor_cms_user_id)) = 0
        or p_reason is null or length(btrim(p_reason)) < 8 then
        raise exception 'validation: invalid projection review action';
    end if;
    select * into v_event from delivery.shipment_events where id = p_event_id for update;
    if not found then raise exception 'not_found: shipment event'; end if;
    if v_event.projection_status <> 'manual_review' then
        raise exception 'conflict: only a manual-review projection can be reviewed';
    end if;
    v_previous_status := v_event.projection_status;
    if p_action = 'resolve_duplicate' then
        if not exists (
            select 1 from delivery.shipment_events projected
            where projected.shipment_id = v_event.shipment_id
              and projected.id <> v_event.id
              and projected.projection_status = 'projected'
              and projected.commerce_projected_at is not null
              and projected.normalized_status is not distinct from v_event.normalized_status
              and projected.occurred_at is not distinct from v_event.occurred_at
        ) then
            raise exception 'conflict: no safely projected duplicate exists';
        end if;
        update delivery.shipment_events set
            projection_status = 'projected', commerce_projected_at = now(),
            projection_claimed_at = null, projection_claimed_by = null,
            projection_claim_token = null,
            projection_last_error = 'resolved as an audited duplicate: ' || left(btrim(p_reason), 1900),
            projection_manual_review_at = null
        where id = v_event.id returning * into v_event;
    else
        update delivery.shipment_events set
            projection_status = 'retry_wait', projection_attempts = 0,
            projection_next_attempt_at = now(), projection_claimed_at = null,
            projection_claimed_by = null, projection_claim_token = null,
            projection_last_error = 'operator requeue: ' || left(btrim(p_reason), 1900),
            projection_manual_review_at = null
        where id = v_event.id returning * into v_event;
    end if;
    insert into delivery.projection_review_actions (
        shipment_event_id, action, actor_cms_user_id, reason,
        previous_status, resulting_status
    ) values (
        v_event.id, p_action, p_actor_cms_user_id, btrim(p_reason),
        v_previous_status, v_event.projection_status
    );
    return to_jsonb(v_event);
end;
$$;

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

create or replace function delivery.claim_due_shipments(
    p_worker_id text,
    p_limit integer default 24
)
returns setof delivery.shipments
language plpgsql
set search_path = ''
as $$
begin
    if p_worker_id is null or length(btrim(p_worker_id)) = 0 then
        raise exception 'validation: tracking worker id is required';
    end if;
    return query
    with candidates as (
        select shipment.id
        from delivery.shipments shipment
        where shipment.status in (
                'created', 'label_ready', 'carrier_accepted', 'in_transit',
                'arrived_at_pickup_point', 'available_for_pickup', 'pickup_expired',
                'returning_to_sender', 'incident', 'cancelled_unscanned'
            )
          and shipment.expedition_number is not null
          and (
              shipment.tracking_next_attempt_at <= now()
              or (
                  shipment.tracking_next_attempt_at is null
                  and (
                      shipment.tracking_checked_at is null
                      or shipment.tracking_checked_at <= now() - interval '4 hours'
                  )
              )
          )
          and (
              shipment.tracking_claimed_at is null
              or shipment.tracking_claimed_at <= now() - interval '20 minutes'
          )
        order by shipment.tracking_next_attempt_at asc nulls first,
                 shipment.tracking_checked_at asc nulls first,
                 shipment.created_at,
                 shipment.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 24), 1), 24)
    )
    update delivery.shipments shipment
    set tracking_claimed_at = now(),
        tracking_claimed_by = p_worker_id
    from candidates
    where shipment.id = candidates.id
    returning shipment.*;
end;
$$;

create or replace function delivery.mark_stale_shipment_creations_unknown(
    p_limit integer default 24,
    p_stale_seconds integer default 1200
)
returns setof delivery.shipments
language plpgsql
set search_path = ''
as $$
begin
    return query
    with candidates as (
        select shipment.id
        from delivery.shipments shipment
        where shipment.status = 'creating'
          and shipment.provider_call_started_at <= now()
              - make_interval(secs => least(greatest(coalesce(p_stale_seconds, 1200), 300), 86400))
        order by shipment.provider_call_started_at, shipment.created_at, shipment.id
        for update skip locked
        limit least(greatest(coalesce(p_limit, 24), 1), 24)
    )
    update delivery.shipments shipment
    set status = 'unknown',
        creation_manual_review_at = coalesce(shipment.creation_manual_review_at, now()),
        last_error = 'shipment creation lease expired before a provider outcome was attached'
    from candidates
    where shipment.id = candidates.id
    returning shipment.*;
end;
$$;

drop trigger if exists shipments_set_updated_at on delivery.shipments;
create trigger shipments_set_updated_at
before update on delivery.shipments
for each row execute function delivery.set_updated_at();

drop trigger if exists relay_selections_set_updated_at on delivery.relay_selections;
create trigger relay_selections_set_updated_at
before update on delivery.relay_selections
for each row execute function delivery.set_updated_at();

drop trigger if exists settings_set_updated_at on delivery.settings;
create trigger settings_set_updated_at
before update on delivery.settings
for each row execute function delivery.set_updated_at();

alter table delivery.shipments enable row level security;
alter table delivery.shipments force row level security;
alter table delivery.relay_selections enable row level security;
alter table delivery.relay_selections force row level security;
alter table delivery.delivery_quotes enable row level security;
alter table delivery.delivery_quotes force row level security;
alter table delivery.settings enable row level security;
alter table delivery.settings force row level security;
alter table delivery.shipment_events enable row level security;
alter table delivery.shipment_events force row level security;
alter table delivery.label_access_tokens enable row level security;
alter table delivery.label_access_tokens force row level security;
alter table delivery.shipment_recovery_events enable row level security;
alter table delivery.shipment_recovery_events force row level security;
alter table delivery.projection_review_actions enable row level security;
alter table delivery.projection_review_actions force row level security;
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
    'Private provider label URL. It is never returned by shipment projections and is proxied only through a short-lived seller capability.';
comment on table delivery.relay_selections is
    'Server-validated pickup point snapshots keyed by an immutable external order id; no shipment is created at selection time.';
comment on table delivery.delivery_quotes is
    'Immutable, buyer-bound Mondial Relay quote and private fulfillment snapshots used by Commerce financial terms and shipment creation.';
comment on column delivery.shipments.delivery_quote_id is
    'Exact immutable Delivery quote authorized by Commerce; main-order shipments never resolve a mutable latest selection.';
comment on column delivery.shipments.declared_value_minor_amount is
    'Immutable merchandise value in EUR minor units; converted exactly to provider major-unit text at the XML boundary.';
comment on table delivery.settings is
    'Editable Mondial Relay delivery defaults used by the cms-delivery Edge Function.';
comment on column delivery.settings.id is
    'Single settings row. Keep the default id unless the connector is versioned for multiple profiles.';
comment on table delivery.shipment_events is
    'Normalized events stored for delivery shipments.';
comment on table delivery.label_access_tokens is
    'Short-lived, seller-bound capability hashes used to proxy provider labels without exposing their URL.';
comment on table delivery.shipment_recovery_events is
    'Audited administrator decisions that attach a verified provider shipment to an ambiguous creation reservation.';
comment on table delivery.projection_review_actions is
    'Audited operator actions that requeue a failed projection or resolve only a provable duplicate without changing carrier truth.';

commit;
