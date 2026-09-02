create or replace function photo_albums.list_public_albums(
    p_q text default null,
    p_category_slug text default null,
    p_limit integer default null,
    p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_default_limit integer;
    v_limit integer;
    v_offset integer := greatest(coalesce(p_offset, 0), 0);
    v_q text := nullif(btrim(p_q), '');
    v_category_slug text := nullif(btrim(p_category_slug), '');
    v_items jsonb;
    v_total bigint;
    v_display jsonb;
begin
    select
        default_page_size,
        jsonb_build_object(
            'gallery_title', gallery_title,
            'default_page_size', default_page_size,
            'allow_downloads', allow_downloads,
            'show_captions', show_captions,
            'show_taken_at', show_taken_at
        )
    into v_default_limit, v_display
    from photo_albums.settings
    where id;
    v_limit := least(greatest(coalesce(p_limit, v_default_limit, 12), 1), 100);

    select count(*)
    into v_total
    from photo_albums.albums a
    left join photo_albums.categories c on c.id = a.category_id
    where a.status = 'published'
      and (v_q is null or a.title ilike '%' || v_q || '%' or a.description ilike '%' || v_q || '%')
      and (v_category_slug is null or c.slug = v_category_slug);

    select coalesce(jsonb_agg(
        jsonb_build_object(
            'id', item.id,
            'slug', item.slug,
            'title', item.title,
            'description', item.description,
            'category', item.category,
            'published_at', item.published_at,
            'photo_count', item.photo_count,
            'cover_photo', item.cover_photo
        )
        order by item.position, item.published_at desc, item.id desc
    ), '[]'::jsonb)
    into v_items
    from (
        select
            a.id, a.slug, a.title, a.description, a.published_at, a.position,
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
        where a.status = 'published'
          and (v_q is null or a.title ilike '%' || v_q || '%' or a.description ilike '%' || v_q || '%')
          and (v_category_slug is null or c.slug = v_category_slug)
        order by a.position, a.published_at desc, a.id desc
        limit v_limit
        offset v_offset
    ) item;

    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset,
        'display', coalesce(v_display, '{}'::jsonb)
    );
end;
$$;

create or replace function photo_albums.get_public_album(
    p_slug text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'id', a.id,
        'slug', a.slug,
        'title', a.title,
        'description', a.description,
        'category', case when c.id is null then null else jsonb_build_object(
            'id', c.id, 'slug', c.slug, 'name', c.name
        ) end,
        'published_at', a.published_at,
        'photo_count', count(p.id)::integer,
        'cover_photo', (jsonb_agg(jsonb_build_object(
            'id', p.id, 'width', p.width, 'height', p.height,
            'alt', p.alt, 'caption', p.caption, 'taken_at', p.taken_at
        ) order by p.position, p.id) filter (where p.id is not null) -> 0),
        'photos', coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id,
            'width', p.width,
            'height', p.height,
            'alt', p.alt,
            'caption', p.caption,
            'taken_at', p.taken_at,
            'position', p.position
        ) order by p.position, p.id) filter (where p.id is not null), '[]'::jsonb),
        'display', jsonb_build_object(
            'allow_downloads', s.allow_downloads,
            'show_captions', s.show_captions,
            'show_taken_at', s.show_taken_at
        )
    )
    from photo_albums.albums a
    left join photo_albums.categories c on c.id = a.category_id
    left join photo_albums.photos p
      on p.album_id = a.id and p.detached_at is null
    cross join photo_albums.settings s
    where a.slug = lower(btrim(p_slug))
      and a.status = 'published'
      and s.id
    group by a.id, c.id, s.id;
$$;
