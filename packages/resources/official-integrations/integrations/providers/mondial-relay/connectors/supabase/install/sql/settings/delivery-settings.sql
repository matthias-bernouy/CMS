

-- ---------------------------------------------------------------------------
-- Operational settings
-- ---------------------------------------------------------------------------
create table if not exists delivery.settings (
    id text primary key default 'default',
    mode_collection text not null default 'REL',
    mode_delivery text not null default '24R',
    customer_reference text not null default 'MERCHANT',
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
    constraint settings_mode_collection_24r check (mode_collection in ('REL', 'CCC')),
    constraint settings_mode_delivery_24r check (mode_delivery = '24R'),
    constraint settings_customer_reference_format check (customer_reference ~ '^[A-Z0-9]{1,9}$'),
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

alter table delivery.settings
    add column if not exists customer_reference text not null default 'MERCHANT';

alter table delivery.settings
    alter column customer_reference set default 'MERCHANT';

alter table delivery.settings
    drop constraint if exists settings_customer_reference_format;

alter table delivery.settings
    add constraint settings_customer_reference_format check (customer_reference ~ '^[A-Z0-9]{1,9}$');

alter table delivery.settings
    alter column mode_collection set default 'REL';

alter table delivery.settings
    drop constraint if exists settings_mode_collection_24r;

alter table delivery.settings
    add constraint settings_mode_collection_24r check (mode_collection in ('REL', 'CCC'));

insert into delivery.settings (id)
values ('default')
on conflict (id) do nothing;
