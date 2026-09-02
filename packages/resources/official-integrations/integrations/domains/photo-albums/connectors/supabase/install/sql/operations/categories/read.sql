create or replace function photo_albums.list_managed_categories(
    p_q text default null,
    p_limit integer default 100,
    p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
    v_q text := nullif(btrim(p_q), '');
    v_items jsonb;
    v_total bigint;
begin
    select count(*)
    into v_total
    from photo_albums.categories c
    where v_q is null
       or c.name ilike '%' || v_q || '%'
       or c.slug ilike '%' || v_q || '%';

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', item.id,
            'slug', item.slug,
            'name', item.name,
            'description', item.description,
            'position', item.position,
            'album_count', item.album_count,
            'version', item.version,
            'created_at', item.created_at,
            'updated_at', item.updated_at
        )
        order by item.position, item.id
    ), '[]'::jsonb)
    into v_items
    from (
        select
            c.*,
            count(a.id)::integer as album_count
        from photo_albums.categories c
        left join photo_albums.albums a on a.category_id = c.id
        where v_q is null
           or c.name ilike '%' || v_q || '%'
           or c.slug ilike '%' || v_q || '%'
        group by c.id
        order by c.position, c.id
        limit v_limit
        offset v_offset
    ) item;

    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset
    );
end;
$$;

create or replace function photo_albums.get_managed_category(
    p_category_id bigint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when p_category_id is null then jsonb_build_object(
            'id', null,
            'slug', '',
            'name', '',
            'description', null,
            'position', 0,
            'album_count', 0,
            'version', 0
        )
        else (
            select jsonb_build_object(
                'id', c.id,
                'slug', c.slug,
                'name', c.name,
                'description', c.description,
                'position', c.position,
                'album_count', count(a.id)::integer,
                'version', c.version,
                'created_at', c.created_at,
                'updated_at', c.updated_at
            )
            from photo_albums.categories c
            left join photo_albums.albums a on a.category_id = c.id
            where c.id = p_category_id
            group by c.id
        )
    end;
$$;
