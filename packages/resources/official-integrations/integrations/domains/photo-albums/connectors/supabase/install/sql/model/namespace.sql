create schema if not exists photo_albums;

revoke all on schema photo_albums from public;
revoke all on schema photo_albums from anon;
revoke all on schema photo_albums from authenticated;

create or replace function photo_albums.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;
