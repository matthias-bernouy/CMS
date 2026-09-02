create or replace function photo_albums.authorize_photo_upload(
    p_album_id bigint,
    p_replace_photo_id bigint default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_status text;
    v_position integer;
    v_count integer;
    v_limit integer;
begin
    select status into v_status
    from photo_albums.albums
    where id = p_album_id;

    if v_status is null or v_status = 'archived' then
        return jsonb_build_object('state', 'not_found');
    end if;

    if p_replace_photo_id is not null then
        select position into v_position
        from photo_albums.photos
        where id = p_replace_photo_id
          and album_id = p_album_id
          and detached_at is null;
        if v_position is null then
            return jsonb_build_object('state', 'not_found');
        end if;
    else
        select count(*)::integer, coalesce(max(position), -1) + 1
        into v_count, v_position
        from photo_albums.photos
        where album_id = p_album_id and detached_at is null;
        select max_photos_per_album into v_limit
        from photo_albums.settings
        where id;
        if v_count >= coalesce(v_limit, 200) then
            return jsonb_build_object('state', 'limit_reached');
        end if;
    end if;

    return jsonb_build_object(
        'state', 'authorized',
        'album_id', p_album_id,
        'replace_photo_id', p_replace_photo_id,
        'position', v_position
    );
end;
$$;

create or replace function photo_albums.attach_album_photo(
    p_album_id bigint,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_width integer,
    p_height integer,
    p_original_filename text,
    p_replace_photo_id bigint default null,
    p_alt text default null,
    p_caption text default null,
    p_taken_at timestamptz default null,
    p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_status text;
    v_position integer;
    v_count integer;
    v_limit integer;
    v_photo_id bigint;
    v_actor text := nullif(btrim(p_actor), '');
begin
    select status into v_status
    from photo_albums.albums
    where id = p_album_id
    for update;

    if v_status is null or v_status = 'archived' then
        raise exception 'not_found: album';
    end if;

    select count(*)::integer, coalesce(max(position), -1) + 1
    into v_count, v_position
    from photo_albums.photos
    where album_id = p_album_id and detached_at is null;
    select max_photos_per_album into v_limit
    from photo_albums.settings
    where id;

    if p_replace_photo_id is null then
        if v_count >= coalesce(v_limit, 200) then
            raise exception 'conflict: album photo limit reached';
        end if;
    else
        select position into v_position
        from photo_albums.photos
        where id = p_replace_photo_id
          and album_id = p_album_id
          and detached_at is null
        for update;
        if v_position is null then
            raise exception 'not_found: replacement photo';
        end if;
        update photo_albums.photos
        set detached_at = now(), updated_by = v_actor
        where id = p_replace_photo_id;
    end if;

    insert into photo_albums.photos (
        album_id, storage_bucket, storage_path, mime_type, file_size,
        width, height, original_filename, alt, caption, taken_at,
        position, created_by, updated_by
    )
    values (
        p_album_id, p_storage_bucket, btrim(p_storage_path), lower(btrim(p_mime_type)),
        p_file_size, p_width, p_height,
        coalesce(nullif(btrim(p_original_filename), ''), 'upload'),
        nullif(btrim(p_alt), ''), nullif(btrim(p_caption), ''), p_taken_at,
        v_position, v_actor, v_actor
    )
    returning id into v_photo_id;

    return photo_albums.get_managed_photo(v_photo_id);
end;
$$;
