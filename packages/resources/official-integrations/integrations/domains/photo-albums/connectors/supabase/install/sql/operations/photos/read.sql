create or replace function photo_albums.list_managed_photos(
    p_album_id bigint,
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
    v_items jsonb;
    v_total bigint;
begin
    select count(*)
    into v_total
    from photo_albums.photos
    where album_id = p_album_id and detached_at is null;

    select coalesce(jsonb_agg(
        jsonb_build_object(
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
        )
        order by p.position, p.id
    ), '[]'::jsonb)
    into v_items
    from (
        select *
        from photo_albums.photos
        where album_id = p_album_id and detached_at is null
        order by position, id
        limit v_limit
        offset v_offset
    ) p;

    return jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset
    );
end;
$$;

create or replace function photo_albums.get_managed_photo(
    p_photo_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
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
        'detached_at', p.detached_at,
        'version', p.version,
        'created_at', p.created_at,
        'updated_at', p.updated_at
    )
    from photo_albums.photos p
    where p.id = p_photo_id;
$$;

create or replace function photo_albums.get_managed_photo_context(
    p_photo_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'photo', jsonb_build_object(
                'id', p.id,
                'album_id', p.album_id,
                'storage_bucket', p.storage_bucket,
                'storage_path', p.storage_path,
                'mime_type', p.mime_type,
                'file_size', p.file_size,
                'width', p.width,
                'height', p.height,
                'original_filename', p.original_filename,
                'alt', p.alt,
                'caption', p.caption,
                'taken_at', p.taken_at,
                'version', p.version
            )
        )
        from photo_albums.photos p
        where p.id = p_photo_id and p.detached_at is null
    ), jsonb_build_object('state', 'not_found'));
$$;
