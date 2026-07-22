

create or replace function commerce.offer_filter_schema(p_category_full_slug text)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with recursive selected as (
        select * from commerce.categories
        where full_slug = p_category_full_slug and status = 'active'
    ), ancestry as (
        select id, parent_id, 0 depth from selected
        union all
        select parent.id, parent.parent_id, child.depth + 1
        from commerce.categories parent join ancestry child on child.parent_id = parent.id
    ), resolved as (
        select distinct on (field.field_key)
            field.field_key, field.required, field.filterable, field.position,
            definition.unit, definition.label, definition.field_type,
            definition.options, definition.public_readable, ancestry.depth
        from ancestry
        join commerce.category_custom_fields field on field.category_id = ancestry.id
        join commerce.custom_field_definitions definition
          on definition.entity_type = field.entity_type and definition.key = field.field_key
        where definition.enabled
          and definition.public_readable
        order by field.field_key, ancestry.depth asc
    )
    select case when not exists (select 1 from selected) then null else jsonb_build_object(
        'category', (select jsonb_build_object(
            'id', id, 'parentId', parent_id, 'slug', slug, 'fullSlug', full_slug, 'label', label
        ) from selected),
        'fields', coalesce((select jsonb_agg(jsonb_build_object(
            'key', field_key, 'label', label, 'type', field_type, 'options', options,
            'required', required, 'filterable', filterable, 'position', position,
            'unit', unit, 'operators', case field_type
                when 'number' then '["eq","gte","lte"]'::jsonb
                when 'boolean' then '["eq"]'::jsonb
                else '["eq","in"]'::jsonb
            end
        ) order by position, field_key) from resolved), '[]'::jsonb)
    ) end;
$$;

create or replace function commerce.get_offer_filter_schema_read_model(
    p_category_full_slug text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with filter_schema as materialized (
        select commerce.offer_filter_schema(p_category_full_slug) value
    )
    select case when filter_schema.value is null then null else
        filter_schema.value || jsonb_build_object(
            'brands', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', brand.id,
                    'slug', brand.slug,
                    'name', brand.name
                ) order by brand.name, brand.id)
                from (
                    select listed.id, listed.slug, listed.name
                    from commerce.brands listed
                    where listed.status = 'active'
                    order by listed.name, listed.id
                    limit 200
                ) brand
            ), '[]'::jsonb)
        )
    end
    from filter_schema;
$$;

revoke execute on function commerce.get_offer_filter_schema_read_model(text)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_filter_schema_read_model(text)
    to service_role;