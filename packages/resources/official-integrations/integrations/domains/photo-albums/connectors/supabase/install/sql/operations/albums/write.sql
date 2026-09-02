create or replace function photo_albums.upsert_album(
    p_slug text,
    p_title text,
    p_album_id bigint default null,
    p_expected_version integer default null,
    p_description text default null,
    p_category_id bigint default null,
    p_status text default 'draft',
    p_position integer default 0,
    p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_id bigint;
    v_actor text := nullif(btrim(p_actor), '');
begin
    if p_album_id is null then
        if coalesce(p_status, 'draft') <> 'draft' then
            raise exception 'validation: new albums must start as drafts';
        end if;

        insert into photo_albums.albums (
            slug, title, description, category_id, status, position,
            created_by, updated_by
        )
        values (
            lower(btrim(p_slug)),
            btrim(p_title),
            nullif(btrim(p_description), ''),
            p_category_id,
            'draft',
            coalesce(p_position, 0),
            v_actor,
            v_actor
        )
        returning id into v_id;
    else
        if p_expected_version is null then
            raise exception 'validation: expected album version is required';
        end if;
        perform 1
        from photo_albums.albums
        where id = p_album_id
          and version = p_expected_version
        for update;
        if not found then
            raise exception 'conflict: album version changed or album was not found';
        end if;
        if p_status = 'published' and not exists (
            select 1
            from photo_albums.photos
            where album_id = p_album_id and detached_at is null
        ) then
            raise exception 'validation: a published album requires at least one photo';
        end if;

        update photo_albums.albums
        set
            slug = lower(btrim(p_slug)),
            title = btrim(p_title),
            description = nullif(btrim(p_description), ''),
            category_id = p_category_id,
            status = coalesce(p_status, 'draft'),
            published_at = case
                when p_status = 'published' then coalesce(published_at, now())
                when p_status = 'draft' then null
                else published_at
            end,
            position = coalesce(p_position, 0),
            version = version + 1,
            updated_by = v_actor
        where id = p_album_id
          and version = p_expected_version
        returning id into v_id;

        if v_id is null then
            raise exception 'conflict: album version changed or album was not found';
        end if;
    end if;

    return photo_albums.get_managed_album(v_id);
end;
$$;

create or replace function photo_albums.archive_album(
    p_album_id bigint,
    p_expected_version integer,
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
    update photo_albums.albums
    set
        status = 'archived',
        version = version + 1,
        updated_by = nullif(btrim(p_actor), '')
    where id = p_album_id
      and version = p_expected_version
      and status <> 'archived'
    returning id into v_id;

    if v_id is null then
        raise exception 'conflict: album version changed, is archived, or was not found';
    end if;

    return photo_albums.get_managed_album(v_id);
end;
$$;

create or replace function photo_albums.reorder_albums(
    p_album_ids bigint[],
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
    v_actor text := nullif(btrim(p_actor), '');
begin
    if p_album_ids is null or cardinality(p_album_ids) = 0 then
        raise exception 'validation: album_ids must not be empty';
    end if;

    select count(*) into v_count
    from photo_albums.albums
    where status <> 'archived';
    select count(distinct id) into v_unique_count
    from unnest(p_album_ids) as requested(id);

    if cardinality(p_album_ids) <> v_unique_count
       or cardinality(p_album_ids) <> v_count
       or exists (
           select 1
           from photo_albums.albums a
           where a.status <> 'archived'
             and not a.id = any(p_album_ids)
       )
    then
        raise exception 'validation: album_ids must contain every active album exactly once';
    end if;

    update photo_albums.albums a
    set
        position = requested.ordinality::integer - 1,
        version = a.version + 1,
        updated_by = v_actor
    from unnest(p_album_ids) with ordinality as requested(id, ordinality)
    where a.id = requested.id and a.status <> 'archived';

    return jsonb_build_object('album_ids', to_jsonb(p_album_ids));
end;
$$;
