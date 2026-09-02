create or replace function commerce.insert_price_agreement_order_line(
    p_order_id bigint,
    p_agreement_id bigint
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_agreement commerce.price_agreements%rowtype;
begin
    select * into v_agreement
    from commerce.price_agreements
    where id = p_agreement_id
    for update;
    if not found then raise exception 'not_found: price agreement'; end if;

    insert into commerce.order_lines (
        order_id, seller_id, offer_id, product_id, variant_id,
        accepted_proposal_id, price_agreement_id,
        title, sku, quantity, inventory_reserved, availability_before,
        inventory_revision_before, unit_amount, total_amount,
        product_snapshot, variant_snapshot, offer_snapshot, seller_snapshot
    )
    with variant_options as (
        select selection.product_id, selection.variant_id,
               jsonb_agg(jsonb_build_object(
                   'axisKey', axis.key,
                   'axisLabel', axis.label,
                   'valueKey', axis_value.key,
                   'valueLabel', axis_value.label
               ) order by axis.position, axis.id) options
        from commerce.product_variant_selections selection
        join commerce.product_variant_axes axis
          on axis.product_id = selection.product_id
         and axis.id = selection.axis_id
        join commerce.product_variant_axis_values axis_value
          on axis_value.product_id = selection.product_id
         and axis_value.axis_id = selection.axis_id
         and axis_value.id = selection.value_id
        join commerce.offers offer
          on offer.product_id = selection.product_id
         and offer.variant_id = selection.variant_id
        where offer.id = v_agreement.offer_id
        group by selection.product_id, selection.variant_id
    ), seller_price as (
        select proposal.id
        from commerce.offer_price_proposals proposal
        where proposal.offer_id = v_agreement.offer_id
          and proposal.status = 'accepted'
        order by proposal.decided_at desc nulls last, proposal.id desc
        limit 1
    )
    select
        p_order_id,
        offer.seller_id,
        offer.id,
        product.id,
        offer.variant_id,
        seller_price.id,
        v_agreement.id,
        offer.title,
        variant.sku,
        v_agreement.quantity,
        case when offer.quantity_available is null then 0 else v_agreement.quantity end,
        case when offer.quantity_available is null then null else offer.availability end,
        case when offer.quantity_available is null then null else offer.inventory_revision end,
        v_agreement.unit_amount,
        v_agreement.unit_amount * v_agreement.quantity,
        jsonb_build_object(
            'id', product.id, 'slug', product.slug, 'title', product.title
        ),
        case when offer.variant_id is null then null else jsonb_build_object(
            'id', variant.id,
            'sku', variant.sku,
            'title', variant.title,
            'combinationKey', variant.combination_key,
            'options', coalesce(options.options, '[]'::jsonb)
        ) end,
        jsonb_build_object(
            'id', offer.id,
            'slug', offer.slug,
            'title', offer.title,
            'conditionCode', offer.condition_code,
            'acceptedPriceAmount', offer.accepted_price_amount,
            'currency', offer.currency,
            'priceAgreement', jsonb_build_object(
                'id', v_agreement.public_id,
                'authority', v_agreement.authority_key,
                'unitAmount', v_agreement.unit_amount
            )
        ),
        jsonb_build_object(
            'id', seller.id,
            'kind', seller.kind,
            'slug', seller.slug,
            'displayName', seller.display_name
        )
    from commerce.offers offer
    join commerce.products product on product.id = offer.product_id
    join commerce.sellers seller on seller.id = offer.seller_id
    left join commerce.product_variants variant on variant.id = offer.variant_id
    left join variant_options options
      on options.product_id = offer.product_id
     and options.variant_id = offer.variant_id
    left join seller_price on true
    where offer.id = v_agreement.offer_id;

    update commerce.offers offer
    set quantity_available = offer.quantity_available - v_agreement.quantity,
        availability = case
            when offer.quantity_available - v_agreement.quantity = 0 then 'unavailable'
            else offer.availability
        end
    where offer.id = v_agreement.offer_id
      and offer.quantity_available is not null;
end;
$$;

revoke execute on function commerce.insert_price_agreement_order_line(bigint, bigint)
from public, anon, authenticated;
grant execute on function commerce.insert_price_agreement_order_line(bigint, bigint)
to service_role;
