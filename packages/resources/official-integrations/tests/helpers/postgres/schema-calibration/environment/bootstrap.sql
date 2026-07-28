do $$
begin
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
    end if;
end
$$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists storage;
create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    owner uuid,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
);
