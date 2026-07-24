

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
    with recursive filter_schema as materialized (
        select commerce.offer_filter_schema(p_category_full_slug) value
    ), selected_category as (
        select category.id
        from commerce.categories category
        where category.full_slug = p_category_full_slug
          and category.status = 'active'
    ), category_scope as (
        select selected.id from selected_category selected
        union all
        select child.id
        from commerce.categories child
        join category_scope parent on child.parent_id = parent.id
        where child.status = 'active'
    ), catalog_products as materialized (
        select product.id, product.brand_id
        from commerce.products product
        join commerce.product_categories category_link
          on category_link.product_id = product.id
         and category_link.is_primary
        where product.status = 'active'
          and product.visibility = 'public'
          and category_link.category_id in (select id from category_scope)
    ), numeric_fields as materialized (
        select field.value->>'key' key
        from filter_schema
        cross join lateral jsonb_array_elements(
            filter_schema.value->'fields'
        ) field(value)
        where field.value @> '{"type":"number","filterable":true}'::jsonb
    ), catalog_metadata as materialized (
        select effective.value
        from catalog_products product
        left join commerce.product_variants variant
          on variant.product_id = product.id
         and variant.status = 'active'
        cross join lateral (
            select commerce.effective_variant_metadata(
                product.id,
                variant.id
            ) value
        ) effective
        where exists (select 1 from numeric_fields)
    ), numeric_values as materialized (
        select
            numeric_field.key,
            (metadata.value->>numeric_field.key)::numeric value
        from numeric_fields numeric_field
        cross join catalog_metadata metadata
        where jsonb_typeof(metadata.value->numeric_field.key) = 'number'
    ), numeric_bounds as (
        select
            numeric_value.key,
            min(numeric_value.value) minimum,
            max(numeric_value.value) maximum,
            1 / power(
                10::numeric,
                least(max(scale(numeric_value.value)), 6)
            ) resolution
        from numeric_values numeric_value
        group by numeric_value.key
    ), numeric_ranges as (
        select
            numeric_bound.key,
            jsonb_build_object(
                'minimum', numeric_bound.minimum,
                'maximum', numeric_bound.maximum,
                'step', case
                    when numeric_bound.maximum > numeric_bound.minimum
                        then (numeric_bound.maximum - numeric_bound.minimum)
                            / ceil(
                                (numeric_bound.maximum - numeric_bound.minimum)
                                / numeric_bound.resolution
                            )
                    else numeric_bound.resolution
                end
            ) value
        from numeric_bounds numeric_bound
    ), fields_with_ranges as (
        select coalesce(jsonb_agg(
            case
                when field.value @> '{"type":"number","filterable":true}'::jsonb
                    then field.value || jsonb_build_object(
                        'range',
                        numeric_range.value
                    )
                else field.value
            end
            order by field.ordinality
        ), '[]'::jsonb) value
        from filter_schema
        cross join lateral jsonb_array_elements(
            filter_schema.value->'fields'
        ) with ordinality field(value, ordinality)
        left join numeric_ranges numeric_range
          on numeric_range.key = field.value->>'key'
    )
    select case when filter_schema.value is null then null else
        filter_schema.value || jsonb_build_object(
            'fields', fields_with_ranges.value,
            'brands', coalesce((
                select jsonb_agg(jsonb_build_object(
                    'id', brand.id,
                    'slug', brand.slug,
                    'name', brand.name
                ) order by brand.name, brand.id)
                from (
                    select distinct listed.id, listed.slug, listed.name
                    from commerce.brands listed
                    join catalog_products product
                      on product.brand_id = listed.id
                    where listed.status = 'active'
                    order by listed.name, listed.id
                    limit 200
                ) brand
            ), '[]'::jsonb)
        )
    end
    from filter_schema
    cross join fields_with_ranges;
$$;

revoke execute on function commerce.get_offer_filter_schema_read_model(text)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_filter_schema_read_model(text)
    to service_role;
