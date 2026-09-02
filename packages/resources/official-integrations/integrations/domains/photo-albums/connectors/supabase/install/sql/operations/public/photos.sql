create or replace function photo_albums.get_public_photo_context(
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
                'taken_at', p.taken_at
            ),
            'allow_downloads', s.allow_downloads
        )
        from photo_albums.photos p
        join photo_albums.albums a on a.id = p.album_id
        cross join photo_albums.settings s
        where p.id = p_photo_id
          and p.detached_at is null
          and a.status = 'published'
          and s.id
    ), jsonb_build_object('state', 'not_found'));
$$;
