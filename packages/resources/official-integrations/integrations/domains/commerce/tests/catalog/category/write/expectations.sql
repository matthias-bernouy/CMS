create function pg_temp.expected_category_field(
    p_key text,
    p_label text,
    p_field_type text,
    p_position integer,
    p_required boolean,
    p_filterable boolean,
    p_category_id bigint,
    p_inherited boolean default false,
    p_unit text default null,
    p_options jsonb default '[]'::jsonb
) returns jsonb language sql immutable as $$
    select jsonb_build_object(
        'id', p_key,
        'fieldKey', p_key,
        'label', p_label,
        'type', case when p_field_type = 'enum' then 'string' else p_field_type end,
        'fieldType', p_field_type,
        'path', 'metadata.' || p_key,
        'section', 'categoryMetadata',
        'options', p_options,
        'required', p_required,
        'adminEditable', true,
        'selfEditable', false,
        'exposeToEditorSources', true,
        'showInDashboardTable', true,
        'filterable', p_filterable,
        'position', p_position,
        'unit', p_unit,
        'operators', case p_field_type
            when 'number' then '["eq","gte","lte"]'::jsonb
            when 'boolean' then '["eq"]'::jsonb
            else '["eq","in"]'::jsonb
        end,
        'inherited', p_inherited,
        'definedByCategoryId', p_category_id
    );
$$;
