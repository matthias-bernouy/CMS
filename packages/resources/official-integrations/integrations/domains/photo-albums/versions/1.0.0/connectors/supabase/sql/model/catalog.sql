create table if not exists photo_albums.categories (
    id bigint generated always as identity primary key,
    slug text not null unique,
    name text not null,
    description text,
    position integer not null default 0,
    version integer not null default 1,
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint categories_slug_format check (
        length(slug) between 1 and 120
        and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    constraint categories_name_length check (
        length(btrim(name)) between 1 and 160
    ),
    constraint categories_description_length check (
        description is null or length(description) <= 4000
    ),
    constraint categories_position_valid check (
        position between 0 and 1000000
    ),
    constraint categories_version_valid check (version > 0),
    constraint categories_actor_length check (
        (created_by is null or length(created_by) <= 200)
        and (updated_by is null or length(updated_by) <= 200)
    )
);

create table if not exists photo_albums.albums (
    id bigint generated always as identity primary key,
    category_id bigint references photo_albums.categories(id) on delete restrict,
    slug text not null unique,
    title text not null,
    description text,
    status text not null default 'draft',
    published_at timestamptz,
    position integer not null default 0,
    version integer not null default 1,
    created_by text,
    updated_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint albums_slug_format check (
        length(slug) between 1 and 160
        and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    constraint albums_title_length check (
        length(btrim(title)) between 1 and 240
    ),
    constraint albums_description_length check (
        description is null or length(description) <= 10000
    ),
    constraint albums_status_valid check (
        status in ('draft', 'published', 'archived')
    ),
    constraint albums_publication_valid check (
        status <> 'published' or published_at is not null
    ),
    constraint albums_position_valid check (
        position between 0 and 1000000
    ),
    constraint albums_version_valid check (version > 0),
    constraint albums_actor_length check (
        (created_by is null or length(created_by) <= 200)
        and (updated_by is null or length(updated_by) <= 200)
    )
);

create index if not exists albums_category_id_idx
    on photo_albums.albums(category_id);
create index if not exists albums_status_published_idx
    on photo_albums.albums(status, published_at desc, id desc);
create index if not exists albums_public_category_idx
    on photo_albums.albums(category_id, position, published_at desc, id desc)
    where status = 'published';
create index if not exists albums_position_idx
    on photo_albums.albums(position, id);

drop trigger if exists categories_touch_updated_at on photo_albums.categories;
create trigger categories_touch_updated_at
before update on photo_albums.categories
for each row execute function photo_albums.touch_updated_at();

drop trigger if exists albums_touch_updated_at on photo_albums.albums;
create trigger albums_touch_updated_at
before update on photo_albums.albums
for each row execute function photo_albums.touch_updated_at();
