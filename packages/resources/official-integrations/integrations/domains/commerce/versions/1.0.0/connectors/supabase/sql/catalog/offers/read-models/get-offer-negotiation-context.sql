

create or replace function commerce.get_offer_negotiation_context(
    p_offer_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select coalesce((
        select jsonb_build_object(
            'state', 'ok',
            'context', jsonb_build_object(
                'offer_id', offer.id,
                'offer_slug', offer.slug,
                'offer_title', offer.title,
                'offer_main_image_media_id', (
                    select link.media_id
                    from commerce.offer_media link
                    where link.offer_id = offer.id
                    order by link.is_main desc, link.sort_order, link.id
                    limit 1
                ),
                'seller_cms_user_id', seller.cms_user_id,
                'seller_display_name', seller.display_name,
                'reference_amount', offer.accepted_price_amount,
                'currency', offer.currency,
                'whole_unit_prices', settings.whole_unit_prices,
                'publication_status', offer.publication_status,
                'availability', offer.availability
            )
        )
        from commerce.offers offer
        cross join commerce.settings settings
        join commerce.sellers seller on seller.id = offer.seller_id
        join commerce.products product on product.id = offer.product_id
        join commerce.offer_workflow_states workflow on workflow.code = offer.workflow_state
        where offer.id = p_offer_id
          and offer.publication_status = 'active'
          and offer.availability = 'available'
          and offer.accepted_price_amount is not null
          and workflow.phase = 'ready'
          and workflow.enabled
          and product.status = 'active'
          and product.visibility = 'public'
          and seller.cms_user_id is not null
          and seller.verification_status in ('pending', 'verified')
          and (not settings.require_verified_seller or seller.verification_status = 'verified')
          and commerce.seller_has_required_sale_capabilities(seller.id)
          and not commerce.offer_has_active_price_agreement(offer.id)
          and (
              (
                  not exists (
                      select 1 from commerce.product_variant_axes axis
                      where axis.product_id = offer.product_id
                  )
                  and (
                      offer.variant_id is null
                      or exists (
                          select 1 from commerce.product_variants variant
                          where variant.id = offer.variant_id
                            and variant.product_id = offer.product_id
                            and variant.status = 'active'
                      )
                  )
              )
              or (
                  offer.variant_id is not null
                  and exists (
                      select 1
                      from commerce.product_variants variant
                      where variant.id = offer.variant_id
                        and variant.product_id = offer.product_id
                        and variant.status = 'active'
                        and variant.combination_key is not null
                        and (
                            select count(distinct selection.axis_id)
                            from commerce.product_variant_selections selection
                            where selection.product_id = offer.product_id
                              and selection.variant_id = offer.variant_id
                        ) = (
                            select count(*)
                            from commerce.product_variant_axes axis
                            where axis.product_id = offer.product_id
                        )
                  )
              )
          )
    ), jsonb_build_object('state', 'not_found'));
$$;

create or replace function commerce.lock_offer_negotiation_context(
    p_offer_id bigint
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_seller_id bigint;
    v_seller_kind text;
    v_product_id bigint;
    v_variant_id bigint;
    v_workflow_state text;
    v_capability_key text;
begin
    select
        offer.seller_id,
        seller.kind,
        offer.product_id,
        offer.variant_id,
        offer.workflow_state
    into
        v_seller_id,
        v_seller_kind,
        v_product_id,
        v_variant_id,
        v_workflow_state
    from commerce.offers offer
    join commerce.sellers seller on seller.id = offer.seller_id
    where offer.id = p_offer_id
    for share of offer, seller;

    if not found then
        return jsonb_build_object('state', 'not_found');
    end if;

    perform 1
    from commerce.products product
    where product.id = v_product_id
    for share;

    perform 1
    from commerce.offer_workflow_states workflow
    where workflow.code = v_workflow_state
    for share;

    if v_variant_id is not null then
        perform 1
        from commerce.product_variants variant
        where variant.id = v_variant_id
        for share;
    end if;

    perform 1
    from commerce.settings settings
    where settings.id = 'default'
    for share;

    for v_capability_key in
        select requirement.capability_key
        from commerce.sale_capability_requirements requirement
        where requirement.enabled
          and requirement.seller_kind = v_seller_kind
        order by requirement.capability_key
    loop
        perform pg_advisory_xact_lock_shared(hashtextextended(
            'commerce.sale-capability:' || v_capability_key, 0
        ));
        perform 1
        from commerce.sale_capability_requirements requirement
        where requirement.capability_key = v_capability_key
        for share;
        perform 1
        from commerce.seller_sale_capabilities capability
        where capability.seller_id = v_seller_id
          and capability.capability_key = v_capability_key
        for share;
    end loop;

    return commerce.get_offer_negotiation_context(p_offer_id);
end;
$$;

revoke execute on function commerce.get_offer_negotiation_context(bigint)
    from public, anon, authenticated;
grant execute on function commerce.get_offer_negotiation_context(bigint)
    to service_role;
revoke execute on function commerce.lock_offer_negotiation_context(bigint)
    from public, anon, authenticated;
grant execute on function commerce.lock_offer_negotiation_context(bigint)
    to service_role;
