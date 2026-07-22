

create or replace function commerce.public_offer_items_read_model(
    p_offer_ids bigint[],
    p_include_inventory_revision boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with requested as materialized (
        select requested.id, requested.ordinality
        from unnest(coalesce(p_offer_ids, array[]::bigint[]))
            with ordinality as requested(id, ordinality)
    ), offer_keys as materialized (
        select coalesce(array_agg(definition.key order by definition.key), array[]::text[]) keys
        from commerce.custom_field_definitions definition
        where definition.entity_type = 'offer'
          and definition.public_readable
          and definition.enabled
    ), product_keys as materialized (
        select coalesce(array_agg(definition.key order by definition.key), array[]::text[]) keys
        from commerce.custom_field_definitions definition
        where definition.entity_type = 'product'
          and definition.public_readable
          and definition.enabled
    ), page as materialized (
        select offer.*, requested.ordinality as read_ordinal
        from requested
        join commerce.offers offer on offer.id = requested.id
    ), page_variants as (
        select distinct page.product_id, page.variant_id
        from page
        where page.variant_id is not null
    ), axis_metadata as (
        select selection.variant_id,
               jsonb_object_agg(axis.field_key, axis_value.value order by selection.axis_id) metadata
        from page_variants page_variant
        join commerce.product_variant_selections selection
          on selection.product_id = page_variant.product_id
         and selection.variant_id = page_variant.variant_id
        join commerce.product_variant_axes axis
          on axis.product_id = selection.product_id
         and axis.id = selection.axis_id
        join commerce.product_variant_axis_values axis_value
          on axis_value.product_id = selection.product_id
         and axis_value.axis_id = selection.axis_id
         and axis_value.id = selection.value_id
        cross join product_keys
        where axis.field_key is not null
          and axis.field_key = any(product_keys.keys)
        group by selection.variant_id
    ), media_rollup as (
        select link.offer_id,
               jsonb_agg(jsonb_build_object(
                   'id', link.id,
                   'offer_id', link.offer_id,
                   'media_id', link.media_id,
                   'sort_order', link.sort_order,
                   'is_main', link.is_main,
                   'media', jsonb_build_object(
                       'id', media.id,
                       'storage_bucket', media.storage_bucket,
                       'storage_path', media.storage_path,
                       'mime_type', media.mime_type,
                       'file_size', media.file_size,
                       'original_filename', media.original_filename,
                       'alt', media.alt,
                       'created_at', media.created_at,
                       'updated_at', media.updated_at,
                       'url', ''
                   )
               ) order by link.sort_order, link.id) media,
               (array_agg(link.media_id order by link.is_main desc, link.sort_order, link.id))[1]::text
                   main_image_media_id
        from page
        join commerce.offer_media link on link.offer_id = page.id
        join commerce.media media on media.id = link.media_id
        group by link.offer_id
    ), items as (
        select page.read_ordinal,
               (case when p_include_inventory_revision
                   then to_jsonb(page) - 'read_ordinal' - 'seller_id'
                   else to_jsonb(page) - 'read_ordinal' - 'seller_id' - 'inventory_revision'
               end) || jsonb_build_object(
                   'metadata', commerce.public_metadata_subset(page.metadata, offer_keys.keys),
                   'product', case when product.id is null then null else jsonb_build_object(
                       'id', product.id,
                       'slug', product.slug,
                       'title', product.title,
                       'brand_id', product.brand_id,
                       'status', product.status,
                       'visibility', product.visibility,
                       'metadata', effective_metadata.value,
                       'brand', case when brand.id is null then null else jsonb_build_object(
                           'id', brand.id,
                           'slug', brand.slug,
                           'name', brand.name,
                           'status', brand.status
                       ) end,
                       'primary_category_id', primary_link.category_id,
                       'primary_category', case when category.id is null then null else jsonb_build_object(
                           'id', category.id,
                           'parent_id', category.parent_id,
                           'slug', category.slug,
                           'full_slug', category.full_slug,
                           'label', category.label,
                           'status', category.status,
                           'position', category.position
                       ) end,
                       'effective_metadata', effective_metadata.value
                   ) end,
                   'variant', case when variant.id is null then null else jsonb_build_object(
                       'id', variant.id,
                       'product_id', variant.product_id,
                       'sku', variant.sku,
                       'title', variant.title,
                       'status', variant.status,
                       'metadata', commerce.public_metadata_subset(variant.metadata, product_keys.keys),
                       'effective_metadata', effective_metadata.value
                   ) end,
                   'media', coalesce(media_rollup.media, '[]'::jsonb),
                   'main_image_media_id', media_rollup.main_image_media_id
               ) value
        from page
        cross join offer_keys
        cross join product_keys
        left join commerce.products product on product.id = page.product_id
        left join commerce.product_variants variant
          on variant.product_id = page.product_id
         and variant.id = page.variant_id
        left join axis_metadata on axis_metadata.variant_id = variant.id
        left join commerce.brands brand on brand.id = product.brand_id
        left join commerce.product_categories primary_link
          on primary_link.product_id = product.id
         and primary_link.is_primary
        left join commerce.categories category on category.id = primary_link.category_id
        left join media_rollup on media_rollup.offer_id = page.id
        cross join lateral (
            select commerce.public_metadata_subset(product.metadata, product_keys.keys)
                || commerce.public_metadata_subset(variant.metadata, product_keys.keys)
                || coalesce(axis_metadata.metadata, '{}'::jsonb) value
        ) effective_metadata
    )
    select coalesce(jsonb_agg(items.value order by items.read_ordinal), '[]'::jsonb)
    from items;
$$;