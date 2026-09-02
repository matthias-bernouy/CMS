create or replace function photo_albums.list_managed_albums(
    p_q text default null,
    p_status text default null,
    p_category_id bigint default null,
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
    v_status text := nullif(btrim(p_status), '');
    v_items jsonb;
    v_total bigint;
begin
    select count(*)
    into v_total
    from photo_albums.albums a
    where (v_q is null or a.title ilike '%' || v_q || '%' or a.slug ilike '%' || v_q || '%')
      and (v_status is null or a.status = v_status)
      and (p_category_id is null or a.category_id = p_category_id);

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', item.id,
            'slug', item.slug,
            'title', item.title,
            'description', item.description,
            'category_id', item.category_id,
            'category', item.category,
            'status', item.status,
            'published_at', item.published_at,
            'position', item.position,
            'photo_count', item.photo_count,
            'cover_photo', item.cover_photo,
            'version', item.version,
            'created_at', item.created_at,
            'updated_at', item.updated_at
        )
        order by item.position, item.id
    ), '[]'::jsonb)
    into v_items
    from (
        select
            a.*,
            case when c.id is null then null else jsonb_build_object(
                'id', c.id, 'slug', c.slug, 'name', c.name
            ) end as category,
            media.photo_count,
            media.cover_photo
        from photo_albums.albums a
        left join photo_albums.categories c on c.id = a.category_id
        left join lateral (
            select
                count(*)::integer as photo_count,
                (jsonb_agg(jsonb_build_object(
                    'id', p.id,
                    'width', p.width,
                    'height', p.height,
                    'alt', p.alt,
                    'caption', p.caption,
                    'taken_at', p.taken_at
                ) order by p.position, p.id) -> 0) as cover_photo
            from photo_albums.photos p
            where p.album_id = a.id and p.detached_at is null
        ) media on true
        where (v_q is null or a.title ilike '%' || v_q || '%' or a.slug ilike '%' || v_q || '%')
          and (v_status is null or a.status = v_status)
          and (p_category_id is null or a.category_id = p_category_id)
        order by a.position, a.id
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

create or replace function photo_albums.get_managed_album(
    p_album_id bigint default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when p_album_id is null then jsonb_build_object(
            'id', null, 'slug', '', 'title', '', 'description', null,
            'category_id', null, 'category', null, 'status', 'draft',
            'published_at', null, 'position', 0, 'photo_count', 0,
            'cover_photo', null, 'photos', '[]'::jsonb, 'version', 0
        )
        else (
            select jsonb_build_object(
                'id', a.id,
                'slug', a.slug,
                'title', a.title,
                'description', a.description,
                'category_id', a.category_id,
                'category', case when c.id is null then null else jsonb_build_object(
                    'id', c.id, 'slug', c.slug, 'name', c.name
                ) end,
                'status', a.status,
                'published_at', a.published_at,
                'position', a.position,
                'photo_count', count(p.id)::integer,
                'cover_photo', (jsonb_agg(jsonb_build_object(
                    'id', p.id, 'width', p.width, 'height', p.height,
                    'alt', p.alt, 'caption', p.caption, 'taken_at', p.taken_at
                ) order by p.position, p.id) filter (where p.id is not null) -> 0),
                'photos', coalesce(jsonb_agg(jsonb_build_object(
                    'id', p.id,
                    'album_id', p.album_id,
                    'mime_type', p.mime_type,
                    'file_size', p.file_size,
                    'width', p.width,
                    'height', p.height,
                    'original_filename', p.original_filename,
                    'alt', p.alt,
                    'caption', p.caption,
                    'taken_at', p.taken_at,
                    'position', p.position,
                    'version', p.version,
                    'created_at', p.created_at,
                    'updated_at', p.updated_at
                ) order by p.position, p.id) filter (where p.id is not null), '[]'::jsonb),
                'version', a.version,
                'created_at', a.created_at,
                'updated_at', a.updated_at
            )
            from photo_albums.albums a
            left join photo_albums.categories c on c.id = a.category_id
            left join photo_albums.photos p
                on p.album_id = a.id and p.detached_at is null
            where a.id = p_album_id
            group by a.id, c.id
        )
    end;
$$;
