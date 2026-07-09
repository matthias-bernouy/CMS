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
    email text,
    phone text,
    display_name text,
    avatar_url text,
    avatar_file_id text,
    locale text,
    timezone text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint accounts_cms_user_id_not_blank check (length(btrim(cms_user_id)) > 0),
    constraint accounts_email_not_blank check (
        email is null or length(btrim(email)) > 0
    ),
    constraint accounts_email_normalized check (
        email is null or email = lower(btrim(email))
    ),
    constraint accounts_email_format check (
        email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
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

create table if not exists user_account.extra_fields (
    id text primary key,
    label text not null,
    field_type text not null,
    required boolean not null default false,
    show_in_dashboard_table boolean not null default false,
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

create index if not exists accounts_email_idx
    on user_account.accounts(email)
    where email is not null;

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
comment on column user_account.accounts.email is
    'Optional lowercase trimmed email address.';
comment on column user_account.accounts.display_name is
    'Optional public or private display name depending on the CMS site design.';
comment on column user_account.accounts.avatar_file_id is
    'Private Supabase Storage object path for an uploaded avatar.';

commit;
