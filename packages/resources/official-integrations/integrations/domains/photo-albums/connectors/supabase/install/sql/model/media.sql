create table if not exists photo_albums.photos (
    id bigint generated always as identity primary key,
    album_id bigint not null references photo_albums.albums(id) on delete restrict,
    storage_bucket text not null default 'photo-albums-originals',
    storage_path text not null,
    mime_type text not null,
    file_size bigint not null,
    width integer not null,
    height integer not null,
    original_filename text not null,
    alt text,
    caption text,
    taken_at timestamptz,
    position integer not null default 0,
    detached_at timestamptz,
    version integer not null default 1,
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint photos_storage_unique unique (storage_bucket, storage_path),
    constraint photos_bucket_fixed check (
        storage_bucket = 'photo-albums-originals'
    ),
    constraint photos_path_length check (
        length(btrim(storage_path)) between 1 and 1024
    ),
    constraint photos_mime_type_valid check (
        mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')
    ),
    constraint photos_file_size_valid check (
        file_size between 1 and 10485760
    ),
    constraint photos_dimensions_valid check (
        width > 0 and height > 0
        and width::bigint * height::bigint <= 40000000
    ),
    constraint photos_filename_length check (
        length(btrim(original_filename)) between 1 and 512
    ),
    constraint photos_alt_length check (
        alt is null or length(alt) <= 500
    ),
    constraint photos_caption_length check (
        caption is null or length(caption) <= 4000
    ),
    constraint photos_position_valid check (
        position between 0 and 1000000
    ),
    constraint photos_version_valid check (version > 0),
    constraint photos_actor_length check (
        (created_by is null or length(created_by) <= 200)
        and (updated_by is null or length(updated_by) <= 200)
    )
);

create index if not exists photos_album_id_idx
    on photo_albums.photos(album_id);
create unique index if not exists photos_active_position_unique
    on photo_albums.photos(album_id, position)
    where detached_at is null;
create index if not exists photos_active_album_order_idx
    on photo_albums.photos(album_id, position, id)
    where detached_at is null;

create or replace function photo_albums.enforce_photo_original_immutability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'conflict: photo originals cannot be deleted';
    end if;
    if row(
        new.id, new.album_id, new.storage_bucket, new.storage_path,
        new.mime_type, new.file_size, new.width, new.height,
        new.original_filename, new.created_at
    ) is distinct from row(
        old.id, old.album_id, old.storage_bucket, old.storage_path,
        old.mime_type, old.file_size, old.width, old.height,
        old.original_filename, old.created_at
    ) then
        raise exception 'conflict: photo original metadata is immutable';
    end if;
    if old.detached_at is not null then
        raise exception 'conflict: detached photos cannot be changed';
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists photos_original_immutability on photo_albums.photos;
create trigger photos_original_immutability
before update or delete on photo_albums.photos
for each row execute function photo_albums.enforce_photo_original_immutability();
