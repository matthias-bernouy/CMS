

drop function if exists commerce.product_read_bundle(bigint, boolean);

create or replace function commerce.product_read_bundle(
    p_product_id bigint,
    p_slug text default null,
    p_include_public_metadata_keys boolean default false,
    p_require_public boolean default false
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
    select jsonb_build_object(
        'product', jsonb_build_object(
            'id', product.id,
            'slug', product.slug,
            'title', product.title,
            'description', product.description,
            'brand_id', product.brand_id,
            'status', product.status,
            'visibility', product.visibility,
            'metadata', product.metadata,
            'version', product.version,
            'created_at', product.created_at,
            'updated_at', product.updated_at
        ),
        'public_metadata_keys', case when p_include_public_metadata_keys then coalesce((
            select jsonb_agg(definition.key order by definition.key)
            from commerce.custom_field_definitions definition
            where definition.entity_type = 'product'
              and definition.public_readable
              and definition.enabled
        ), '[]'::jsonb) else '[]'::jsonb end,
        'axes', coalesce((
            select jsonb_agg(to_jsonb(axis_row) order by axis_row.position, axis_row.id)
            from (
                select axis.id, axis.key, axis.field_key, axis.label, axis.position
                from commerce.product_variant_axes axis
                where axis.product_id = product.id
            ) axis_row
        ), '[]'::jsonb),
        'values', coalesce((
            select jsonb_agg(to_jsonb(value_row) order by value_row.position, value_row.id)
            from (
                select axis_value.id, axis_value.axis_id, axis_value.key,
                       axis_value.label, axis_value.value, axis_value.position
                from commerce.product_variant_axis_values axis_value
                where axis_value.product_id = product.id
            ) value_row
        ), '[]'::jsonb),
        'variants', coalesce((
            select jsonb_agg(to_jsonb(variant_row) order by variant_row.position, variant_row.id)
            from (
                select variant.id, variant.product_id, variant.sku, variant.title,
                       variant.status, variant.position, variant.combination_key,
                       variant.generated_from_axes, variant.metadata, variant.version,
                       variant.created_at, variant.updated_at
                from commerce.product_variants variant
                where variant.product_id = product.id
            ) variant_row
        ), '[]'::jsonb),
        'selections', coalesce((
            select jsonb_agg(to_jsonb(selection_row))
            from (
                select selection.variant_id, selection.axis_id, selection.value_id
                from commerce.product_variant_selections selection
                where selection.product_id = product.id
            ) selection_row
        ), '[]'::jsonb),
        'media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', link.id,
                'media_id', link.media_id,
                'sort_order', link.sort_order,
                'is_main', link.is_main,
                'media', case when stored.id is null then null else jsonb_build_object(
                    'id', stored.id,
                    'storage_bucket', stored.storage_bucket,
                    'storage_path', stored.storage_path,
                    'mime_type', stored.mime_type,
                    'file_size', stored.file_size,
                    'width', stored.width,
                    'height', stored.height,
                    'original_filename', stored.original_filename,
                    'alt', stored.alt,
                    'created_at', stored.created_at,
                    'updated_at', stored.updated_at
                ) end
            ) order by link.sort_order, link.id)
            from commerce.product_media link
            join commerce.media stored
              on stored.id = link.media_id
             and stored.detached_at is null
            where link.product_id = product.id
        ), '[]'::jsonb),
        'brand', case when product.brand_id is null or product.brand_id = 0 then null else (
            select jsonb_build_object(
                'id', brand.id,
                'slug', brand.slug,
                'name', brand.name,
                'status', brand.status
            )
            from commerce.brands brand
            where brand.id = product.brand_id
            limit 1
        ) end,
        'categories', coalesce((
            select jsonb_agg(jsonb_build_object(
                'product_id', link.product_id,
                'category_id', link.category_id,
                'is_primary', link.is_primary,
                'position', link.position,
                'category', case when category.id is null then null else jsonb_build_object(
                    'id', category.id,
                    'parent_id', category.parent_id,
                    'slug', category.slug,
                    'full_slug', category.full_slug,
                    'label', category.label,
                    'status', category.status,
                    'position', category.position
                ) end
            ) order by link.is_primary desc, link.position, link.category_id)
            from commerce.product_categories link
            left join commerce.categories category on category.id = link.category_id
            where link.product_id = product.id
        ), '[]'::jsonb)
    )
    from commerce.products product
    where ((p_product_id is not null and product.id = p_product_id)
        or (p_product_id is null and p_slug is not null and product.slug = p_slug))
      and (not p_require_public
        or (product.status = 'active' and product.visibility = 'public'))
    limit 1;
$$;
