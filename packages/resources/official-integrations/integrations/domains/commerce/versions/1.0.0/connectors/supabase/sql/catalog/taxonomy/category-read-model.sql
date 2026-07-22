

create or replace function commerce.get_category_read_model(
    p_scope text,
    p_category_id bigint default null,
    p_full_slug text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when p_scope is null or p_scope not in ('public', 'admin')
            then jsonb_build_object('state', 'invalid_scope')
        else coalesce((
            select jsonb_build_object(
                'state', 'ok',
                'category', jsonb_build_object(
                    'id', category.id,
                    'parent_id', category.parent_id,
                    'slug', category.slug,
                    'full_slug', category.full_slug,
                    'label', category.label,
                    'description', category.description,
                    'status', category.status,
                    'position', category.position,
                    'metadata', category.metadata,
                    'version', category.version,
                    'created_at', category.created_at,
                    'updated_at', category.updated_at
                ),
                'parent', case
                    when category.parent_id is null or category.parent_id = 0 or parent.id is null
                        then null
                    else jsonb_build_object(
                        'id', parent.id,
                        'slug', parent.slug,
                        'full_slug', parent.full_slug,
                        'label', parent.label,
                        'status', parent.status
                    )
                end,
                'category_fields', case when p_scope = 'admin' then coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'category_id', field.category_id,
                        'field_key', field.field_key,
                        'required', field.required,
                        'filterable', field.filterable,
                        'position', field.position,
                        'definition', case when definition.key is null then null else jsonb_build_object(
                            'label', definition.label,
                            'field_type', definition.field_type,
                            'options', definition.options,
                            'unit', definition.unit,
                            'public_readable', definition.public_readable,
                            'enabled', definition.enabled
                        ) end
                    ) order by field.position, field.field_key)
                    from commerce.category_custom_fields field
                    left join commerce.custom_field_definitions definition
                      on definition.entity_type = field.entity_type
                     and definition.key = field.field_key
                    where field.category_id = category.id
                ), '[]'::jsonb) else '[]'::jsonb end
            )
            from commerce.categories category
            left join commerce.categories parent
              on category.parent_id <> 0 and parent.id = category.parent_id
            where ((p_category_id is not null and category.id = p_category_id)
                or (p_category_id is null and p_full_slug is not null
                    and category.full_slug = p_full_slug))
              and (p_scope = 'admin' or category.status = 'active')
            limit 1
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_category_read_model(text, bigint, text)
    from public, anon, authenticated;
grant execute on function commerce.get_category_read_model(text, bigint, text)
    to service_role;