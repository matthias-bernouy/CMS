create or replace function forms.get_published_form(
    p_form_key text,
    p_version integer default null,
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
    select
        jsonb_build_object(
            'key', f.form_key,
            'title', v.title,
            'description', v.description,
            'accessMode', v.access_mode,
            'version', v.version_number,
            'definition', v.definition,
            'publishedAt', v.published_at
        ),
        v.access_mode
    into result, required_access
    from forms.forms f
    join forms.form_versions v
      on v.form_id = f.id
     and v.version_number = coalesce(p_version, f.published_version)
    where f.form_key = p_form_key
      and f.lifecycle_status = 'active';

    if result is null then
        raise exception 'not_found: form is not available';
    end if;
    if required_access = 'authenticated' and nullif(btrim(p_actor_id), '') is null then
        raise exception 'not_found: form is not available';
    end if;
    return result;
end;
$$;
