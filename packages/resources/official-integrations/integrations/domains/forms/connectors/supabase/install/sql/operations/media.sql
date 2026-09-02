create or replace function forms.definition_media_ids(p_definition jsonb)
returns setof bigint
language plpgsql
stable
set search_path = ''
as $$
declare
    value jsonb;
    media_id text;
begin
    for value in
        select match
        from jsonb_path_query(p_definition, '$.steps[*].fields[*].options[*].image.mediaId') as matches(match)
    loop
        media_id := case when jsonb_typeof(value) = 'string' then value #>> '{}' else null end;
        if media_id is null or media_id !~ '^[1-9][0-9]{0,18}$' then
            raise exception 'validation: form media references must be positive identifiers';
        end if;
        return next media_id::bigint;
    end loop;
exception
    when numeric_value_out_of_range then
        raise exception 'validation: form media reference is too large';
end;
$$;

create or replace function forms.sync_draft_media(p_form_id bigint, p_definition jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if exists (
        select 1
        from forms.definition_media_ids(p_definition) referenced(media_id)
        left join forms.media stored on stored.form_id = p_form_id and stored.id = referenced.media_id
        where stored.id is null
    ) then
        raise exception 'validation: a form image does not belong to this form';
    end if;

    delete from forms.form_draft_media link
    where link.form_id = p_form_id
      and not exists (
          select 1 from forms.definition_media_ids(p_definition) referenced(media_id)
          where referenced.media_id = link.media_id
      );

    insert into forms.form_draft_media (form_id, media_id)
    select distinct p_form_id, referenced.media_id
    from forms.definition_media_ids(p_definition) referenced(media_id)
    on conflict (form_id, media_id) do nothing;
end;
$$;

create or replace function forms.create_media(
    p_form_key text,
    p_storage_bucket text,
    p_storage_path text,
    p_mime_type text,
    p_file_size bigint,
    p_width integer,
    p_height integer,
    p_original_filename text,
    p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    owner forms.forms%rowtype;
    stored forms.media%rowtype;
begin
    select * into owner from forms.forms where form_key = p_form_key;
    if not found then
        raise exception 'not_found: form does not exist';
    end if;
    insert into forms.media (
        form_id, storage_bucket, storage_path, mime_type, file_size,
        width, height, original_filename, created_by
    ) values (
        owner.id, p_storage_bucket, p_storage_path, lower(p_mime_type), p_file_size,
        p_width, p_height, btrim(p_original_filename), p_actor_id
    ) returning * into stored;
    return jsonb_build_object(
        'mediaId', stored.id,
        'mimeType', stored.mime_type,
        'fileSize', stored.file_size,
        'width', stored.width,
        'height', stored.height,
        'originalFilename', stored.original_filename
    );
end;
$$;

create or replace function forms.get_managed_media_context(p_media_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    select jsonb_build_object(
        'mediaId', media.id,
        'formKey', owner.form_key,
        'storageBucket', media.storage_bucket,
        'storagePath', media.storage_path,
        'mimeType', media.mime_type
    ) into result
    from forms.media media
    join forms.forms owner on owner.id = media.form_id
    where media.id = p_media_id;
    if result is null then
        raise exception 'not_found: form image does not exist';
    end if;
    return result;
end;
$$;

create or replace function forms.get_published_media_context(
    p_form_key text,
    p_version integer,
    p_media_id bigint,
    p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
    required_access text;
begin
    select jsonb_build_object(
        'mediaId', media.id,
        'storageBucket', media.storage_bucket,
        'storagePath', media.storage_path,
        'mimeType', media.mime_type
    ), version.access_mode
    into result, required_access
    from forms.forms owner
    join forms.form_versions version
      on version.form_id = owner.id and version.version_number = p_version
    join forms.form_version_media link
      on link.form_id = version.form_id and link.version_number = version.version_number
    join forms.media media on media.id = link.media_id and media.form_id = owner.id
    where owner.form_key = p_form_key
      and owner.lifecycle_status = 'active'
      and media.id = p_media_id;
    if result is null or (required_access = 'authenticated' and nullif(btrim(p_actor_id), '') is null) then
        raise exception 'not_found: form image is not available';
    end if;
    return result;
end;
$$;
