

create or replace function commerce.category_custom_field_schema(p_category_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with recursive ancestry as (
        select id, parent_id, 0 depth from commerce.categories where id = p_category_id
        union all
        select parent.id, parent.parent_id, child.depth + 1
        from commerce.categories parent join ancestry child on child.parent_id = parent.id
    ), resolved as (
        select distinct on (field.field_key)
            field.*, definition.label, definition.field_type, definition.options,
            definition.admin_editable, definition.public_readable, definition.unit definition_unit,
            definition.show_in_dashboard_table, ancestry.depth
        from ancestry
        join commerce.category_custom_fields field on field.category_id = ancestry.id
        join commerce.custom_field_definitions definition
          on definition.entity_type = field.entity_type and definition.key = field.field_key
        where definition.enabled
        order by field.field_key, ancestry.depth asc
    )
    select jsonb_build_object('fields', coalesce(jsonb_agg(jsonb_build_object(
        'id', field_key, 'fieldKey', field_key, 'label', label,
        'type', case when field_type = 'enum' then 'string' else field_type end,
        'fieldType', field_type, 'path', 'metadata.' || field_key,
        'section', 'categoryMetadata', 'options', case when field_type = 'enum' then (
            select coalesce(jsonb_agg(jsonb_build_object('value', value, 'label', value)), '[]'::jsonb)
            from jsonb_array_elements_text(options) value
        ) else '[]'::jsonb end,
        'required', required, 'adminEditable', admin_editable,
        'selfEditable', false, 'exposeToEditorSources', public_readable,
        'showInDashboardTable', show_in_dashboard_table,
        'filterable', filterable, 'position', position, 'unit', definition_unit,
        'operators', case field_type
            when 'number' then '["eq","gte","lte"]'::jsonb
            when 'boolean' then '["eq"]'::jsonb
            else '["eq","in"]'::jsonb
        end, 'inherited', category_id <> p_category_id,
        'definedByCategoryId', category_id
    ) order by position, field_key), '[]'::jsonb)) from resolved;
$$;