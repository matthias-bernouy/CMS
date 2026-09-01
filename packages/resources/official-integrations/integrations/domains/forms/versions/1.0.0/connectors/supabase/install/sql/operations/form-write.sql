create or replace function forms.save_form_draft(
    p_form_key text,
    p_title text,
    p_description text,
    p_access_mode text,
    p_definition jsonb,
    p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if jsonb_typeof(p_definition) <> 'object' then
        raise exception 'validation: definition must be an object';
    end if;
    insert into forms.forms (
        form_key, title, description, access_mode, draft_definition, created_by, updated_by
    ) values (
        p_form_key, btrim(p_title), nullif(btrim(p_description), ''), p_access_mode, p_definition, p_actor_id, p_actor_id
    )
    on conflict (form_key) do update set
        title = excluded.title,
        description = excluded.description,
        access_mode = excluded.access_mode,
        draft_definition = excluded.draft_definition,
        lifecycle_status = 'active',
        updated_by = excluded.updated_by;
    return forms.get_managed_form(p_form_key);
end;
$$;

create or replace function forms.publish_form(p_form_key text, p_actor_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    locked_form forms.forms%rowtype;
    next_version integer;
begin
    select * into locked_form
    from forms.forms
    where form_key = p_form_key
    for update;
    if not found then
        raise exception 'not_found: form does not exist';
    end if;
    next_version := coalesce(locked_form.published_version, 0) + 1;
    insert into forms.form_versions (
        form_id, version_number, definition_schema_version, title, description,
        access_mode, definition, published_by
    ) values (
        locked_form.id,
        next_version,
        (locked_form.draft_definition ->> 'schemaVersion')::integer,
        locked_form.title,
        locked_form.description,
        locked_form.access_mode,
        locked_form.draft_definition,
        p_actor_id
    );
    update forms.forms set
        published_version = next_version,
        lifecycle_status = 'active',
        updated_by = p_actor_id
    where id = locked_form.id;
    return forms.get_managed_form(p_form_key);
exception
    when invalid_text_representation then
        raise exception 'validation: definition schemaVersion must be an integer';
end;
$$;

create or replace function forms.archive_form(p_form_key text, p_actor_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    update forms.forms set lifecycle_status = 'archived', updated_by = p_actor_id
    where form_key = p_form_key;
    if not found then
        raise exception 'not_found: form does not exist';
    end if;
    return forms.get_managed_form(p_form_key);
end;
$$;
