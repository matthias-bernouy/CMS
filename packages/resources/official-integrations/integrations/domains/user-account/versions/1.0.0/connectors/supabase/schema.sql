-- Supabase personal information schema for CMS-backed user profile data.
--
-- Run this SQL against the target Supabase database. The CMS must not query
-- this table directly; the Edge Function owns all reads and writes.

begin;

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

create table if not exists user_account.extra_fields (
    id text primary key,
    label text not null,
    field_type text not null,
    required boolean not null default false,
    multiple boolean not null default false,
    show_in_dashboard_table boolean not null default false,
    options jsonb not null default '[]'::jsonb,
    position integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint extra_fields_id_format check (
        id ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
    ),
    constraint extra_fields_label_not_blank check (
        length(btrim(label)) > 0
    ),
    constraint extra_fields_type_supported check (
        field_type in ('string', 'number', 'boolean')
    )
);

alter table user_account.accounts
    add column if not exists avatar_file_id text;

alter table user_account.accounts
    add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table user_account.accounts
    add column if not exists given_name text,
    add column if not exists surname text,
    add column if not exists birth_date date,
    add column if not exists address_line_1 text,
    add column if not exists address_line_2 text,
    add column if not exists address_line_3 text,
    add column if not exists postal_code text,
    add column if not exists city text,
    add column if not exists region text,
    add column if not exists country_code text;

alter table user_account.extra_fields
    add column if not exists options jsonb not null default '[]'::jsonb;

alter table user_account.extra_fields
    add column if not exists multiple boolean not null default false;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_avatar_file_id_not_blank'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_avatar_file_id_not_blank check (
                avatar_file_id is null or length(btrim(avatar_file_id)) > 0
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_avatar_file_id_length'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_avatar_file_id_length check (
                avatar_file_id is null or length(avatar_file_id) <= 512
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'accounts_metadata_object'
          and conrelid = 'user_account.accounts'::regclass
    ) then
        alter table user_account.accounts
            add constraint accounts_metadata_object check (
                jsonb_typeof(metadata) = 'object'
            );
    end if;
end $$;

do $$
declare
    constraint_name text;
    constraint_expression text;
begin
    for constraint_name, constraint_expression in
        select * from (values
            ('accounts_given_name_length', 'given_name is null or length(btrim(given_name)) between 1 and 100'),
            ('accounts_surname_length', 'surname is null or length(btrim(surname)) between 1 and 100'),
            ('accounts_birth_date_range', 'birth_date is null or birth_date between date ''1900-01-01'' and current_date'),
            ('accounts_address_line_1_length', 'address_line_1 is null or length(btrim(address_line_1)) between 1 and 200'),
            ('accounts_address_line_2_length', 'address_line_2 is null or length(btrim(address_line_2)) between 1 and 200'),
            ('accounts_address_line_3_length', 'address_line_3 is null or length(btrim(address_line_3)) between 1 and 200'),
            ('accounts_postal_code_length', 'postal_code is null or length(btrim(postal_code)) between 1 and 32'),
            ('accounts_city_length', 'city is null or length(btrim(city)) between 1 and 120'),
            ('accounts_region_length', 'region is null or length(btrim(region)) between 1 and 120'),
            ('accounts_country_code_format', 'country_code is null or country_code ~ ''^[A-Z]{2}$''')
        ) as constraints(name, expression)
    loop
        if not exists (
            select 1
            from pg_constraint
            where conname = constraint_name
              and conrelid = 'user_account.accounts'::regclass
        ) then
            execute format(
                'alter table user_account.accounts add constraint %I check (%s)',
                constraint_name,
                constraint_expression
            );
        end if;
    end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'user-account-avatars',
    'user-account-avatars',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists extra_fields_position_idx
    on user_account.extra_fields(position, id);

create or replace function user_account.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on user_account.accounts;
create trigger accounts_set_updated_at
before update on user_account.accounts
for each row execute function user_account.set_updated_at();

drop trigger if exists extra_fields_set_updated_at on user_account.extra_fields;
create trigger extra_fields_set_updated_at
before update on user_account.extra_fields
for each row execute function user_account.set_updated_at();

alter table user_account.accounts enable row level security;
alter table user_account.accounts force row level security;
alter table user_account.extra_fields enable row level security;
alter table user_account.extra_fields force row level security;

comment on table user_account.extra_fields is
    'Dashboard-managed personal information metadata field definitions.';

revoke all on all tables in schema user_account from public;
revoke all on all tables in schema user_account from anon;
revoke all on all tables in schema user_account from authenticated;
revoke all on all functions in schema user_account from public;
revoke all on all functions in schema user_account from anon;
revoke all on all functions in schema user_account from authenticated;

grant usage on schema user_account to service_role;
grant select, insert, update, delete on all tables in schema user_account to service_role;
grant execute on all functions in schema user_account to service_role;

alter default privileges in schema user_account
grant select, insert, update, delete on tables to service_role;

alter default privileges in schema user_account
grant execute on functions to service_role;

comment on schema user_account is
    'Private user personal information schema owned by Supabase Edge Functions.';
comment on table user_account.accounts is
    'Minimal CMS user personal information data keyed by the trusted x-user-id header.';
comment on column user_account.accounts.cms_user_id is
    'Stable user id computed by the CMS and forwarded as x-user-id.';
comment on column user_account.accounts.display_name is
    'Deprecated legacy display name retained for existing installations.';
comment on column user_account.accounts.given_name is
    'Optional private given name.';
comment on column user_account.accounts.surname is
    'Optional private family name.';
comment on column user_account.accounts.birth_date is
    'Optional private birth date without a time component.';
comment on column user_account.accounts.country_code is
    'Optional ISO 3166-1 alpha-2 country code.';
comment on column user_account.accounts.avatar_file_id is
    'Private Supabase Storage object path for an uploaded avatar.';

commit;
