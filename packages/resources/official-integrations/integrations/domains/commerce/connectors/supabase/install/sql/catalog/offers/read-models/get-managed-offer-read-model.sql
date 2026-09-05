

create or replace function commerce.get_managed_offer_read_model(
    p_scope text,
    p_offer_id bigint default null,
    p_slug text default null,
    p_cms_user_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    with candidate as materialized (
        select offer.*,
               seller.id as resolved_seller_id,
               seller.cms_user_id as owner_cms_user_id,
               seller.kind as seller_kind,
               seller.slug as seller_slug,
               seller.display_name as seller_display_name,
               seller.verification_status as seller_verification_status
        from commerce.offers offer
        left join commerce.sellers seller on seller.id = offer.seller_id
        where (p_offer_id is not null and offer.id = p_offer_id)
           or (p_offer_id is null and p_slug is not null and offer.slug = p_slug)
        limit 1
    ), access_state as materialized (
        select case
            when p_scope is null or p_scope not in ('self', 'admin') then 'invalid_scope'
            when not exists(select 1 from candidate) then 'not_found'
            when p_scope = 'admin' then 'ok'
            when candidate.resolved_seller_id is null then 'not_found'
            when nullif(btrim(p_cms_user_id), '') is null then 'identity_required'
            when candidate.owner_cms_user_id is distinct from btrim(p_cms_user_id) then 'not_found'
            else 'ok'
        end state
        from (values (true)) singleton(value)
        left join candidate on true
    ), authorized_offer as materialized (
        select candidate.*
        from candidate
        cross join access_state
        where access_state.state = 'ok'
    ), product_keys as materialized (
        select coalesce(array_agg(definition.key order by definition.key), array[]::text[]) keys
        from commerce.custom_field_definitions definition
        where p_scope = 'self'
          and exists(select 1 from authorized_offer)
          and definition.entity_type = 'product'
          and definition.public_readable
          and definition.enabled
    ), item as (
        select jsonb_build_object(
            'id', offer.id,
            'seller_id', offer.seller_id,
            'product_id', offer.product_id,
            'variant_id', offer.variant_id,
            'slug', offer.slug,
            'title', offer.title,
            'description', offer.description,
            'condition_code', offer.condition_code,
            'condition_label', condition.label,
            'publication_status', offer.publication_status,
            'workflow_state', offer.workflow_state,
            'accepted_price_amount', offer.accepted_price_amount,
            'currency', offer.currency,
            'whole_unit_prices', settings.whole_unit_prices,
            'availability', offer.availability,
            'quantity_available', offer.quantity_available,
            'metadata', offer.metadata,
            'version', offer.version,
            'created_at', offer.created_at,
            'updated_at', offer.updated_at,
            'seller', case when offer.resolved_seller_id is null then null else jsonb_build_object(
                'id', offer.resolved_seller_id,
                'kind', offer.seller_kind,
                'slug', offer.seller_slug,
                'display_name', offer.seller_display_name,
                'verification_status', offer.seller_verification_status
            ) end,
            'product', case when product.id is null then null else jsonb_build_object(
                'id', product.id,
                'slug', product.slug,
                'title', product.title,
                'brand_id', product.brand_id,
                'status', product.status,
                'visibility', product.visibility,
                'metadata', case when p_scope = 'self'
                    then commerce.public_metadata_subset(product.metadata, product_keys.keys)
                    else product.metadata
                end,
                'brand', case when brand.id is null then null else jsonb_build_object(
                    'id', brand.id,
                    'slug', brand.slug,
                    'name', brand.name,
                    'status', brand.status
                ) end,
                'primary_category_id', primary_category.category_id,
                'primary_category', case when primary_category.id is null then null else jsonb_build_object(
                    'id', primary_category.id,
                    'parent_id', primary_category.parent_id,
                    'slug', primary_category.slug,
                    'full_slug', primary_category.full_slug,
                    'label', primary_category.label,
                    'status', primary_category.status,
                    'position', primary_category.category_position
                ) end
            ) end,
            'variant', case when variant.id is null then null else jsonb_build_object(
                'id', variant.id,
                'sku', variant.sku,
                'title', variant.title,
                'status', variant.status
            ) end,
            'price_rule', price_rule.value,
            'price_proposals', coalesce(proposals.value, '[]'::jsonb),
            'media', coalesce(media.value, '[]'::jsonb),
            'main_image_media_id', media.main_image_media_id
        ) value
        from authorized_offer offer
        cross join product_keys
        cross join commerce.settings settings
        left join commerce.products product on product.id = offer.product_id
        left join commerce.offer_conditions condition on condition.code = offer.condition_code
        left join commerce.product_variants variant
          on variant.id = offer.variant_id
         and offer.variant_id <> 0
        left join commerce.brands brand
          on brand.id = product.brand_id
         and product.brand_id <> 0
        left join lateral (
            select link.category_id,
                   category.id,
                   category.parent_id,
                   category.slug,
                   category.full_slug,
                   category.label,
                   category.status,
                   category.position as category_position
            from commerce.product_categories link
            left join commerce.categories category on category.id = link.category_id
            where link.product_id = product.id
              and link.is_primary
            order by link.position
            limit 1
        ) primary_category on true
        left join lateral (
            select case when p_scope = 'admin' then jsonb_build_object(
                'offer_id', rule.offer_id,
                'minimum_amount', rule.minimum_amount,
                'maximum_amount', rule.maximum_amount,
                'currency', rule.currency,
                'configured_by', rule.configured_by,
                'version', rule.version,
                'created_at', rule.created_at,
                'updated_at', rule.updated_at
            ) else jsonb_build_object(
                'offer_id', rule.offer_id,
                'minimum_amount', rule.minimum_amount,
                'maximum_amount', rule.maximum_amount,
                'currency', rule.currency,
                'version', rule.version,
                'created_at', rule.created_at,
                'updated_at', rule.updated_at
            ) end value
            from commerce.offer_price_rules rule
            where rule.offer_id = offer.id
            limit 1
        ) price_rule on true
        left join lateral (
            select jsonb_agg(proposal.value order by proposal.created_at desc) value
            from (
                select proposal.created_at,
                       case when p_scope = 'admin' then jsonb_build_object(
                           'id', proposal.id,
                           'offer_id', proposal.offer_id,
                           'amount', proposal.amount,
                           'currency', proposal.currency,
                           'status', proposal.status,
                           'proposed_by', proposal.proposed_by,
                           'decided_by', proposal.decided_by,
                           'decision_reason', proposal.decision_reason,
                           'decided_at', proposal.decided_at,
                           'created_at', proposal.created_at
                       ) else jsonb_build_object(
                           'id', proposal.id,
                           'offer_id', proposal.offer_id,
                           'amount', proposal.amount,
                           'currency', proposal.currency,
                           'status', proposal.status,
                           'decision_reason', proposal.decision_reason,
                           'decided_at', proposal.decided_at,
                           'created_at', proposal.created_at
                       ) end value
                from commerce.offer_price_proposals proposal
                where proposal.offer_id = offer.id
                order by proposal.created_at desc
                limit 20
            ) proposal
        ) proposals on true
        left join lateral (
            select jsonb_agg(media_item.value order by media_item.sort_order, media_item.id) value,
                   (array_agg(
                       media_item.media_id
                       order by media_item.is_main desc, media_item.sort_order, media_item.id
                   ))[1]::text main_image_media_id
            from (
                select link.id,
                       link.media_id,
                       link.sort_order,
                       link.is_main,
                       jsonb_build_object(
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
                               'updated_at', stored.updated_at,
                               'url', ''
                           ) end
                       ) value
                from commerce.offer_media link
                join commerce.media stored
                  on stored.id = link.media_id
                 and stored.detached_at is null
                where link.offer_id = offer.id
            ) media_item
        ) media on true
    )
    select case when access_state.state = 'ok'
        then jsonb_build_object('state', 'ok', 'offer', item.value)
        else jsonb_build_object('state', access_state.state)
    end
    from access_state
    left join item on true;
$$;
