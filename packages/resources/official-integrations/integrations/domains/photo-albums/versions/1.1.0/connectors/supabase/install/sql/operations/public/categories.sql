create or replace function photo_albums.list_public_categories()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'items',
        coalesce(jsonb_agg(
            jsonb_build_object(
                'id', item.id,
                'slug', item.slug,
                'name', item.name,
                'description', item.description,
                'position', item.position,
                'album_count', item.album_count
            )
            order by item.position, item.id
        ), '[]'::jsonb)
    )
    from (
        select
            c.id,
            c.slug,
            c.name,
            c.description,
            c.position,
            count(a.id)::integer as album_count
        from photo_albums.categories c
        join photo_albums.albums a
          on a.category_id = c.id
         and a.status = 'published'
        group by c.id
        order by c.position, c.id
    ) item;
$$;
