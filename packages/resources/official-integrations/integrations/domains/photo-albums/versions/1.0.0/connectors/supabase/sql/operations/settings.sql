create or replace function photo_albums.get_settings()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'gallery_title', gallery_title,
        'default_page_size', default_page_size,
        'max_photos_per_album', max_photos_per_album,
        'allow_downloads', allow_downloads,
        'show_captions', show_captions,
        'show_taken_at', show_taken_at,
        'version', version,
        'updated_at', updated_at
    )
    from photo_albums.settings
    where id;
$$;

create or replace function photo_albums.update_settings(
    p_expected_version integer,
    p_gallery_title text,
    p_default_page_size integer,
    p_max_photos_per_album integer,
    p_allow_downloads boolean,
    p_show_captions boolean,
    p_show_taken_at boolean,
    p_actor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_id boolean;
begin
    update photo_albums.settings
    set
        gallery_title = btrim(p_gallery_title),
        default_page_size = p_default_page_size,
        max_photos_per_album = p_max_photos_per_album,
        allow_downloads = p_allow_downloads,
        show_captions = p_show_captions,
        show_taken_at = p_show_taken_at,
        version = version + 1,
        updated_by = nullif(btrim(p_actor), '')
    where id
      and version = p_expected_version
    returning id into v_id;

    if v_id is null then
        raise exception 'conflict: settings version changed';
    end if;
    return photo_albums.get_settings();
end;
$$;

create or replace function photo_albums.configure_connector_credential(
    p_secret_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
    insert into photo_albums.connector_credentials (
        credential_key, secret_hash
    )
    values (
        'cms_api_key', lower(btrim(p_secret_hash))
    )
    on conflict (credential_key) do update
    set secret_hash = excluded.secret_hash;

    return jsonb_build_object('configured', true);
end;
$$;

create or replace function photo_albums.get_connector_credential_hash()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
    select secret_hash
    from photo_albums.connector_credentials
    where credential_key = 'cms_api_key';
$$;
