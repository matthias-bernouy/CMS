

create or replace function commerce.list_public_offers_read_model(
    p_workflow_state text default null,
    p_condition_code text default null,
    p_product_id text default null,
    p_variant_id text default null,
    p_seller_id text default null,
    p_price_min bigint default null,
    p_price_max bigint default null,
    p_query text default null,
    p_sort text default null,
    p_limit integer default 50,
    p_offset integer default 0
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
    ), filtered as materialized (
        select offer.id, offer.accepted_price_amount, offer.updated_at
        from commerce.offers offer
        join commerce.sellers seller on seller.id = offer.seller_id
        cross join settings_state settings
        where offer.publication_status = 'active'
          and offer.availability = 'available'
          and seller.verification_status in ('pending', 'verified')
          and (not settings.require_verified_seller or seller.verification_status = 'verified')
          and commerce.seller_has_required_sale_capabilities(seller.id)
          and not commerce.offer_has_active_price_agreement(offer.id)
          and (p_workflow_state is null or offer.workflow_state = p_workflow_state)
          and (p_condition_code is null or offer.condition_code = p_condition_code)
          and (p_product_id is null or offer.product_id = p_product_id::bigint)
          and (p_variant_id is null or offer.variant_id = p_variant_id::bigint)
          and (p_seller_id is null or offer.seller_id = p_seller_id::bigint)
          and (p_price_min is null or offer.accepted_price_amount >= p_price_min)
          and (p_price_max is null or offer.accepted_price_amount <= p_price_max)
          and (p_query is null or offer.title ilike '%' || p_query || '%'
               or offer.slug ilike '%' || p_query || '%')
    ), page_ids as materialized (
        select filtered.*
        from filtered
        order by
            case when p_sort = 'price-asc' then filtered.accepted_price_amount end asc nulls last,
            case when p_sort = 'price-desc' then filtered.accepted_price_amount end desc nulls last,
            filtered.updated_at desc,
            filtered.id desc
        limit least(greatest(coalesce(p_limit, 50), 1), 100)
        offset greatest(coalesce(p_offset, 0), 0)
    )
    select jsonb_build_object(
        'settings_available', (select count(*) = 1 from settings_state),
        'items', commerce.public_offer_items_read_model(coalesce((select array_agg(page_ids.id order by
            case when p_sort = 'price-asc' then page_ids.accepted_price_amount end asc nulls last,
            case when p_sort = 'price-desc' then page_ids.accepted_price_amount end desc nulls last,
            page_ids.updated_at desc,
            page_ids.id desc
        ) from page_ids), array[]::bigint[])),
        'total', (select count(*) from filtered)
    );
$$;
