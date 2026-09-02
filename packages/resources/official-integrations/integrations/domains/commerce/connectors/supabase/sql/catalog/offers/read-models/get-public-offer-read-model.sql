

create or replace function commerce.get_public_offer_read_model(
    p_offer_id bigint default null,
    p_slug text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with settings_state as materialized (
        select settings.require_verified_seller
        from commerce.settings settings
        where settings.id = 'default'
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
    ), candidate_offer as materialized (
        select offer.*
        from commerce.offers offer
        where offer.publication_status = 'active'
          and ((p_offer_id is not null and offer.id = p_offer_id)
            or (p_offer_id is null and p_slug is not null and offer.slug = p_slug))
        limit 1
    ), eligible_offer as materialized (
        select offer.*
        from candidate_offer offer
        join commerce.sellers seller on seller.id = offer.seller_id
        cross join settings_state settings
        where seller.verification_status in ('pending', 'verified')
          and (not settings.require_verified_seller or seller.verification_status = 'verified')
          and commerce.seller_has_required_sale_capabilities(seller.id)
          and not commerce.offer_has_active_price_agreement(offer.id)
    ), media_rollup as (
        select link.offer_id,
               jsonb_agg(jsonb_build_object(
                   'id', link.id,
                   'media_id', link.media_id,
                   'sort_order', link.sort_order,
                   'is_main', link.is_main,
                   'media', jsonb_build_object(
                       'id', media.id,
                       'storage_bucket', media.storage_bucket,
                       'storage_path', media.storage_path,
                       'mime_type', media.mime_type,
                       'file_size', media.file_size,
                       'width', media.width,
                       'height', media.height,
                       'original_filename', media.original_filename,
                       'alt', media.alt,
                       'created_at', media.created_at,
                       'updated_at', media.updated_at,
                       'url', ''
                   )
               ) order by link.sort_order, link.id) media,
               (array_agg(link.media_id order by link.is_main desc, link.sort_order, link.id))[1]::text
                   main_image_media_id
        from eligible_offer offer
        join commerce.offer_media link on link.offer_id = offer.id
        join commerce.media media
          on media.id = link.media_id
         and media.detached_at is null
        group by link.offer_id
    ), item as (
        select (to_jsonb(offer) - 'seller_id' - 'inventory_revision')
               || jsonb_build_object(
                   'metadata', commerce.public_metadata_subset(offer.metadata, offer_keys.keys),
                   'product', case when product.id is null then null else jsonb_build_object(
                       'id', product.id,
                       'slug', product.slug,
                       'title', product.title,
                       'brand_id', product.brand_id,
                       'status', product.status,
                       'visibility', product.visibility,
                       'metadata', commerce.public_metadata_subset(product.metadata, product_keys.keys),
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
                       ) end
                   ) end,
                   'variant', case when variant.id is null then null else jsonb_build_object(
                       'id', variant.id,
                       'sku', variant.sku,
                       'title', variant.title,
                       'status', variant.status
                   ) end,
                   'price_rule', null,
                   'price_proposals', '[]'::jsonb,
                   'media', coalesce(media_rollup.media, '[]'::jsonb),
                   'main_image_media_id', media_rollup.main_image_media_id
               ) value
        from eligible_offer offer
        cross join offer_keys
        cross join product_keys
        left join commerce.products product on product.id = offer.product_id
        left join commerce.product_variants variant
          on variant.product_id = offer.product_id
         and variant.id = offer.variant_id
        left join commerce.brands brand on brand.id = product.brand_id
        left join commerce.product_categories primary_link
          on primary_link.product_id = product.id
         and primary_link.is_primary
        left join commerce.categories category on category.id = primary_link.category_id
        left join media_rollup on media_rollup.offer_id = offer.id
    )
    select jsonb_build_object(
        'candidate_exists', exists(select 1 from candidate_offer),
        'settings_available', (select count(*) = 1 from settings_state),
        'offer', (select item.value from item)
    );
$$;
