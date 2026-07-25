alter table photo_albums.categories enable row level security;
alter table photo_albums.categories force row level security;
alter table photo_albums.albums enable row level security;
alter table photo_albums.albums force row level security;
alter table photo_albums.photos enable row level security;
alter table photo_albums.photos force row level security;
alter table photo_albums.settings enable row level security;
alter table photo_albums.settings force row level security;
alter table photo_albums.connector_credentials enable row level security;
alter table photo_albums.connector_credentials force row level security;

revoke all on schema photo_albums from public;
revoke all on schema photo_albums from anon;
revoke all on schema photo_albums from authenticated;
revoke all on schema photo_albums from service_role;

revoke all on all tables in schema photo_albums from public;
revoke all on all tables in schema photo_albums from anon;
revoke all on all tables in schema photo_albums from authenticated;
revoke all on all tables in schema photo_albums from service_role;
revoke all on all sequences in schema photo_albums from public;
revoke all on all sequences in schema photo_albums from anon;
revoke all on all sequences in schema photo_albums from authenticated;
revoke all on all sequences in schema photo_albums from service_role;

grant usage on schema photo_albums to service_role;
grant select, insert, update, delete
    on photo_albums.categories to service_role;
grant select, insert, update
    on photo_albums.albums to service_role;
grant select, insert, update
    on photo_albums.photos to service_role;
grant select, update
    on photo_albums.settings to service_role;
grant select, insert, update
    on photo_albums.connector_credentials to service_role;
grant usage, select on all sequences in schema photo_albums to service_role;

alter default privileges in schema photo_albums
revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema photo_albums
revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema photo_albums
revoke execute on functions from public, anon, authenticated, service_role;

comment on schema photo_albums is
    'Private photo album data exposed only through the CMS connector.';
comment on table photo_albums.photos is
    'Immutable Supabase Storage originals with mutable presentation metadata.';
comment on table photo_albums.connector_credentials is
    'Optional test fallback containing only a lowercase SHA-256 API-key hash.';
