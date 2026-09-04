

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