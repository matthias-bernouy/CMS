create table if not exists photo_albums.settings (
    id boolean primary key default true,
    gallery_title text not null default 'Photo albums',
    default_page_size integer not null default 12,
    max_photos_per_album integer not null default 200,
    allow_downloads boolean not null default false,
    show_captions boolean not null default true,
    show_taken_at boolean not null default false,
    version integer not null default 1,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint settings_singleton check (id),
    constraint settings_gallery_title_length check (
        length(btrim(gallery_title)) between 1 and 160
    ),
    constraint settings_page_size_valid check (
        default_page_size between 1 and 100
    ),
    constraint settings_photo_limit_valid check (
        max_photos_per_album between 1 and 500
    ),
    constraint settings_version_valid check (version > 0),
    constraint settings_actor_length check (
        updated_by is null or length(updated_by) <= 200
    )
);

create table if not exists photo_albums.connector_credentials (
    credential_key text primary key,
    secret_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint connector_credentials_key_valid check (
        credential_key = 'cms_api_key'
    ),
    constraint connector_credentials_hash_valid check (
        secret_hash ~ '^[0-9a-f]{64}$'
    )
);

insert into photo_albums.settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists settings_touch_updated_at on photo_albums.settings;
create trigger settings_touch_updated_at
before update on photo_albums.settings
for each row execute function photo_albums.touch_updated_at();

drop trigger if exists connector_credentials_touch_updated_at
    on photo_albums.connector_credentials;
create trigger connector_credentials_touch_updated_at
before update on photo_albums.connector_credentials
for each row execute function photo_albums.touch_updated_at();
