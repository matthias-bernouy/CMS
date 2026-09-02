create or replace function forms.get_managed_form(p_form_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    select jsonb_build_object(
        'id', f.id,
        'key', f.form_key,
        'title', f.title,
        'description', f.description,
        'accessMode', f.access_mode,
        'status', case
            when f.lifecycle_status = 'archived' then 'archived'
            when f.published_version is not null then 'published'
            else 'draft'
        end,
        'version', f.published_version,
        'draftDefinition', f.draft_definition,
        'publishedAt', v.published_at,
        'createdAt', f.created_at,
        'updatedAt', f.updated_at
    ) into result
    from forms.forms f
    left join forms.form_versions v
      on v.form_id = f.id and v.version_number = f.published_version
    where f.form_key = p_form_key;
    if result is null then
        raise exception 'not_found: form does not exist';
    end if;
    return result;
end;
$$;

create or replace function forms.list_managed_forms(
    p_query text default null,
    p_status text default null,
    p_limit integer default 50,
    p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    with filtered as (
        select f.*,
            case
                when f.lifecycle_status = 'archived' then 'archived'
                when f.published_version is not null then 'published'
                else 'draft'
            end as display_status
        from forms.forms f
        where (
            nullif(btrim(p_query), '') is null
            or f.title ilike '%' || btrim(p_query) || '%'
            or f.form_key ilike '%' || btrim(p_query) || '%'
        )
    ), page as (
        select *, count(*) over () as total_count
        from filtered
        where nullif(btrim(p_status), '') is null or display_status = p_status
        order by updated_at desc, id desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
        offset greatest(coalesce(p_offset, 0), 0)
    )
    select jsonb_build_object(
        'items', coalesce(jsonb_agg(jsonb_build_object(
            'id', id,
            'key', form_key,
            'title', title,
            'description', description,
            'accessMode', access_mode,
            'status', display_status,
            'version', published_version,
            'updatedAt', updated_at
        ) order by updated_at desc, id desc), '[]'::jsonb),
        'total', coalesce(max(total_count), 0)
    )
    from page;
$$;
