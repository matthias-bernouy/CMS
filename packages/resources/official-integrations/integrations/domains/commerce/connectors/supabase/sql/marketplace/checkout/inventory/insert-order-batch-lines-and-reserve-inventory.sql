

create or replace function commerce.insert_order_batch_lines_and_reserve_inventory(
    p_order_ids jsonb,
    p_items jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
    insert into commerce.order_lines (
        order_id, seller_id, offer_id, product_id, variant_id, accepted_proposal_id,
        title, sku, quantity, inventory_reserved, availability_before,
        inventory_revision_before, unit_amount, total_amount,
        product_snapshot, variant_snapshot, offer_snapshot, seller_snapshot
    )
    with input as materialized (
        select
            item.ordinality::integer as position,
            (item.value->>'offerId')::bigint as offer_id,
            (item.value->>'quantity')::integer as quantity
        from jsonb_array_elements(p_items) with ordinality item(value, ordinality)
    ),
    order_input as materialized (
        select
            item.ordinality::integer as position,
            order_row.id as order_id,
            order_row.seller_id
        from jsonb_array_elements(p_order_ids) with ordinality item(value, ordinality)
        join commerce.orders order_row on order_row.id = (item.value#>>'{}')::bigint
    ),
    variant_options as (
        select selection.product_id, selection.variant_id,
               jsonb_agg(jsonb_build_object(
                   'axisKey', axis.key,
                   'axisLabel', axis.label,
                   'valueKey', axis_value.key,
                   'valueLabel', axis_value.label
               ) order by axis.position, axis.id) as options
        from commerce.product_variant_selections selection
        join commerce.product_variant_axes axis
          on axis.product_id = selection.product_id and axis.id = selection.axis_id
        join commerce.product_variant_axis_values axis_value
          on axis_value.product_id = selection.product_id
         and axis_value.axis_id = selection.axis_id
         and axis_value.id = selection.value_id
        where selection.variant_id in (
            select offer.variant_id
            from commerce.offers offer join input on input.offer_id = offer.id
            where offer.variant_id is not null
        )
        group by selection.product_id, selection.variant_id
    ),
    accepted_proposals as (
        select distinct on (proposal.offer_id) proposal.offer_id, proposal.id
        from commerce.offer_price_proposals proposal
        join input on input.offer_id = proposal.offer_id
        where proposal.status = 'accepted'
        order by proposal.offer_id, proposal.decided_at desc nulls last, proposal.id desc
    )
    select
        order_input.order_id,
        offer.seller_id,
        offer.id,
        product.id,
        offer.variant_id,
        proposal.id,
        offer.title,
        variant.sku,
        input.quantity,
        case when offer.quantity_available is null then 0 else input.quantity end,
        case when offer.quantity_available is null then null else offer.availability end,
        case when offer.quantity_available is null then null else offer.inventory_revision end,
        offer.accepted_price_amount,
        offer.accepted_price_amount * input.quantity,
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
            'currency', offer.currency
        ),
        jsonb_build_object(
            'id', seller.id,
            'kind', seller.kind,
            'slug', seller.slug,
            'displayName', seller.display_name
        )
    from input
    join commerce.offers offer on offer.id = input.offer_id
    join order_input on order_input.seller_id = offer.seller_id
    join commerce.products product on product.id = offer.product_id
    join commerce.sellers seller on seller.id = offer.seller_id
    left join commerce.product_variants variant on variant.id = offer.variant_id
    left join variant_options options
      on options.product_id = offer.product_id and options.variant_id = offer.variant_id
    left join accepted_proposals proposal on proposal.offer_id = offer.id
    order by order_input.position, input.position;

    update commerce.offers offer
    set quantity_available = offer.quantity_available - input.quantity,
        availability = case
            when offer.quantity_available - input.quantity = 0 then 'unavailable'
            else offer.availability
        end
    from (
        select (item->>'offerId')::bigint as offer_id,
               (item->>'quantity')::integer as quantity
        from jsonb_array_elements(p_items) item
    ) input
    where offer.id = input.offer_id
      and offer.quantity_available is not null;
end;
$$;