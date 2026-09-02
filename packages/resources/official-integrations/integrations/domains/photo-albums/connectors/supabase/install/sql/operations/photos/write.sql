create or replace function photo_albums.update_album_photo(
    p_album_id bigint,
    p_photo_id bigint,
    p_expected_version integer,
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
    v_id bigint;
begin
    update photo_albums.photos
    set
        alt = nullif(btrim(p_alt), ''),
        caption = nullif(btrim(p_caption), ''),
        taken_at = p_taken_at,
        version = version + 1,
        updated_by = nullif(btrim(p_actor), '')
    where id = p_photo_id
      and album_id = p_album_id
      and detached_at is null
      and version = p_expected_version
    returning id into v_id;

    if v_id is null then
        raise exception 'conflict: photo version changed or photo was not found';
    end if;
    return photo_albums.get_managed_photo(v_id);
end;
$$;

create or replace function photo_albums.detach_album_photo(
    p_album_id bigint,
    p_photo_id bigint,
    p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_status text;
    v_count integer;
    v_detached_at timestamptz;
begin
    select status into v_status
    from photo_albums.albums
    where id = p_album_id
    for update;
    if v_status is null or v_status = 'archived' then
        raise exception 'not_found: album';
    end if;

    select count(*)::integer into v_count
    from photo_albums.photos
    where album_id = p_album_id and detached_at is null;
    if v_status = 'published' and v_count <= 1 then
        raise exception 'conflict: a published album requires at least one photo';
    end if;

    update photo_albums.photos
    set
        detached_at = now(),
        updated_by = nullif(btrim(p_actor), '')
    where id = p_photo_id
      and album_id = p_album_id
      and detached_at is null
    returning detached_at into v_detached_at;
    if v_detached_at is null then
        raise exception 'not_found: photo';
    end if;

    return jsonb_build_object(
        'removed', true,
        'photo_id', p_photo_id,
        'detached_at', v_detached_at
    );
end;
$$;

create or replace function photo_albums.reorder_album_photos(
    p_album_id bigint,
    p_photo_ids bigint[],
    p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_count integer;
    v_unique_count integer;
    v_shift integer;
    v_actor text := nullif(btrim(p_actor), '');
begin
    perform 1
    from photo_albums.albums
    where id = p_album_id and status <> 'archived'
    for update;
    if not found then
        raise exception 'not_found: album';
    end if;
    if p_photo_ids is null or cardinality(p_photo_ids) = 0 then
        raise exception 'validation: photo_ids must not be empty';
    end if;

    select count(*)::integer, coalesce(max(position), -1) + cardinality(p_photo_ids) + 1
    into v_count, v_shift
    from photo_albums.photos
    where album_id = p_album_id and detached_at is null;
    select count(distinct id) into v_unique_count
    from unnest(p_photo_ids) as requested(id);

    if cardinality(p_photo_ids) <> v_count
       or cardinality(p_photo_ids) <> v_unique_count
       or exists (
           select 1
           from photo_albums.photos p
           where p.album_id = p_album_id
             and p.detached_at is null
             and not p.id = any(p_photo_ids)
       )
    then
        raise exception 'validation: photo_ids must contain every attached photo exactly once';
    end if;

    update photo_albums.photos
    set position = position + v_shift, updated_by = v_actor
    where album_id = p_album_id and detached_at is null;

    update photo_albums.photos p
    set
        position = requested.ordinality::integer - 1,
        version = p.version + 1,
        updated_by = v_actor
    from unnest(p_photo_ids) with ordinality as requested(id, ordinality)
    where p.id = requested.id and p.album_id = p_album_id;

    return jsonb_build_object('photo_ids', to_jsonb(p_photo_ids));
end;
$$;
