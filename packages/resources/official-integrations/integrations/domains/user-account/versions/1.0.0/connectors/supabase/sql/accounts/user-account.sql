

create schema if not exists user_account;

revoke all on schema user_account from public;
revoke all on schema user_account from anon;
revoke all on schema user_account from authenticated;

create table if not exists user_account.accounts (
    cms_user_id text primary key,
    phone text,
    display_name text,
    given_name text,
    surname text,
    birth_date date,
    address_line_1 text,
    address_line_2 text,
    address_line_3 text,
    postal_code text,
    city text,
    region text,
    country_code text,
    avatar_url text,
    avatar_file_id text,
    locale text,
    timezone text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounts_cms_user_id_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint accounts_phone_not_blank check (
        phone is null or length(btrim(phone)) > 0
    ),
    constraint accounts_phone_length check (
        phone is null or length(phone) <= 64
    ),
    constraint accounts_display_name_not_blank check (
        display_name is null or length(btrim(display_name)) > 0
    ),
    constraint accounts_display_name_length check (
        display_name is null or length(display_name) <= 160
    ),
    constraint accounts_given_name_length check (
        given_name is null or length(btrim(given_name)) between 1 and 100
    ),
    constraint accounts_surname_length check (
        surname is null or length(btrim(surname)) between 1 and 100
    ),
    constraint accounts_birth_date_range check (
        birth_date is null or birth_date between date '1900-01-01' and current_date
    ),
    constraint accounts_address_line_1_length check (
        address_line_1 is null or length(btrim(address_line_1)) between 1 and 200
    ),
    constraint accounts_address_line_2_length check (
        address_line_2 is null or length(btrim(address_line_2)) between 1 and 200
    ),
    constraint accounts_address_line_3_length check (
        address_line_3 is null or length(btrim(address_line_3)) between 1 and 200
    ),
    constraint accounts_postal_code_length check (
        postal_code is null or length(btrim(postal_code)) between 1 and 32
    ),
    constraint accounts_city_length check (
        city is null or length(btrim(city)) between 1 and 120
    ),
    constraint accounts_region_length check (
        region is null or length(btrim(region)) between 1 and 120
    ),
    constraint accounts_country_code_format check (
        country_code is null or country_code ~ '^[A-Z]{2}$'
    ),
    constraint accounts_avatar_url_http check (
        avatar_url is null or avatar_url ~* '^https?://'
    ),
    constraint accounts_avatar_url_length check (
        avatar_url is null or length(avatar_url) <= 2048
    ),
    constraint accounts_avatar_file_id_not_blank check (
        avatar_file_id is null or length(btrim(avatar_file_id)) > 0
    ),
    constraint accounts_avatar_file_id_length check (
        avatar_file_id is null or length(avatar_file_id) <= 512
    ),
    constraint accounts_locale_not_blank check (
        locale is null or length(btrim(locale)) > 0
    ),
    constraint accounts_locale_length check (
        locale is null or length(locale) <= 35
    ),
    constraint accounts_timezone_not_blank check (
        timezone is null or length(btrim(timezone)) > 0
    ),
    constraint accounts_timezone_length check (
        timezone is null or length(timezone) <= 64
    ),
    constraint accounts_metadata_object check (
        jsonb_typeof(metadata) = 'object'
    )
);

alter table user_account.accounts
    drop column if exists email;