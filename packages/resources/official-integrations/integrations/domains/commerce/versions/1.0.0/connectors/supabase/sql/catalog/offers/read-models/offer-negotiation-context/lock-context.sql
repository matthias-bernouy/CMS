
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
