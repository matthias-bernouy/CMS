create or replace function photo_albums.upsert_category(
    p_slug text,
    p_name text,
    p_category_id bigint default null,
    p_expected_version integer default null,
    p_description text default null,
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
    if p_category_id is null then
        insert into photo_albums.categories (
            slug, name, description, position, created_by, updated_by
        )
        values (
            lower(btrim(p_slug)),
            btrim(p_name),
            nullif(btrim(p_description), ''),
            coalesce(p_position, 0),
            v_actor,
            v_actor
        )
        returning id into v_id;
    else
        if p_expected_version is null then
            raise exception 'validation: expected category version is required';
        end if;

        update photo_albums.categories
        set
            slug = lower(btrim(p_slug)),
            name = btrim(p_name),
            description = nullif(btrim(p_description), ''),
            position = coalesce(p_position, 0),
            version = version + 1,
            updated_by = v_actor
        where id = p_category_id
          and version = p_expected_version
        returning id into v_id;

        if v_id is null then
            raise exception 'conflict: category version changed or category was not found';
        end if;
    end if;

    return photo_albums.get_managed_category(v_id);
end;
$$;

create or replace function photo_albums.delete_category(
    p_category_id bigint,
    p_expected_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_id bigint;
begin
    if exists (
        select 1
        from photo_albums.albums
        where category_id = p_category_id
    ) then
        raise exception 'conflict: category is used by an album';
    end if;

    delete from photo_albums.categories
    where id = p_category_id
      and version = p_expected_version
    returning id into v_id;

    if v_id is null then
        raise exception 'conflict: category version changed or category was not found';
    end if;

    return jsonb_build_object('deleted', true, 'id', v_id);
end;
$$;

create or replace function photo_albums.reorder_categories(
    p_category_ids bigint[],
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
    if p_category_ids is null or cardinality(p_category_ids) = 0 then
        raise exception 'validation: category_ids must not be empty';
    end if;

    select count(*) into v_count from photo_albums.categories;
    select count(distinct id) into v_unique_count
    from unnest(p_category_ids) as requested(id);

    if cardinality(p_category_ids) <> v_unique_count
       or cardinality(p_category_ids) <> v_count
       or exists (
           select 1
           from photo_albums.categories c
           where not c.id = any(p_category_ids)
       )
    then
        raise exception 'validation: category_ids must contain every category exactly once';
    end if;

    update photo_albums.categories c
    set
        position = requested.ordinality::integer - 1,
        version = c.version + 1,
        updated_by = v_actor
    from unnest(p_category_ids) with ordinality as requested(id, ordinality)
    where c.id = requested.id;

    return jsonb_build_object('category_ids', to_jsonb(p_category_ids));
end;
$$;
