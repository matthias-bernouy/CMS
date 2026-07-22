

create or replace function commerce.validate_order_creation_batches(
    p_buyer_cms_user_id text,
    p_items jsonb,
    p_require_verified_seller boolean,
    p_mode text,
    p_split_by_seller boolean
)
returns table (error_message text, order_summaries jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    return query
    with input as materialized (
        select
            item.ordinality::integer as position,
            (item.value->>'offerId')::bigint as offer_id,
            (item.value->>'quantity')::integer as quantity
        from jsonb_array_elements(p_items) with ordinality item(value, ordinality)
    ),
    axis_counts as (
        select axis.product_id, count(*)::integer as axis_count
        from commerce.product_variant_axes axis
        where axis.product_id in (
            select offer.product_id
            from commerce.offers offer join input on input.offer_id = offer.id
        )
        group by axis.product_id
    ),
    selection_counts as (
        select selection.product_id, selection.variant_id,
               count(distinct selection.axis_id)::integer as selection_count
        from commerce.product_variant_selections selection
        where selection.variant_id in (
            select offer.variant_id
            from commerce.offers offer join input on input.offer_id = offer.id
            where offer.variant_id is not null
        )
        group by selection.product_id, selection.variant_id
    ),
    context as materialized (
        select
            input.position,
            input.quantity,
            offer.id as offer_id,
            offer.seller_id,
            offer.product_id,
            offer.variant_id,
            offer.quantity_available,
            offer.publication_status,
            workflow.phase as workflow_phase,
            workflow.enabled as workflow_enabled,
            offer.availability,
            offer.accepted_price_amount,
            product.status as product_status,
            product.visibility as product_visibility,
            coalesce(axis.axis_count, 0) as axis_count,
            variant.product_id as variant_product_id,
            variant.status as variant_status,
            variant.combination_key as variant_combination_key,
            coalesce(selection.selection_count, 0) as selection_count,
            seller.cms_user_id as seller_cms_user_id,
            seller.verification_status as seller_verification_status,
            seller.kind as seller_kind,
            offer.currency,
            case when p_split_by_seller then
                dense_rank() over (order by offer.seller_id)::integer
            else 1 end as batch_position,
            case when p_split_by_seller then
                row_number() over (
                    partition by offer.seller_id order by offer.id, input.position
                )::integer
            else input.position end as line_position,
            case when p_split_by_seller then
                count(*) over (partition by offer.seller_id)::integer
            else count(*) over ()::integer end as batch_item_count,
            first_value(offer.seller_id) over input_order as first_seller_id,
            first_value(offer.currency) over input_order as first_currency,
            sum(offer.accepted_price_amount::numeric * input.quantity)
                over cumulative_order as cumulative_subtotal
        from input
        join commerce.offers offer on offer.id = input.offer_id
        join commerce.products product on product.id = offer.product_id
        join commerce.sellers seller on seller.id = offer.seller_id
        join commerce.offer_workflow_states workflow on workflow.code = offer.workflow_state
        left join commerce.product_variants variant on variant.id = offer.variant_id
        left join axis_counts axis on axis.product_id = offer.product_id
        left join selection_counts selection
          on selection.product_id = offer.product_id
         and selection.variant_id = offer.variant_id
        window
            input_order as (
                order by input.position
                rows between unbounded preceding and unbounded following
            ),
            cumulative_order as (
                partition by case when p_split_by_seller then offer.seller_id else 0 end
                order by input.position
                rows between unbounded preceding and current row
            )
    ),
    evaluated as materialized (
        select context.*, case
            when p_split_by_seller and context.batch_item_count > 100 then
                'validation: order items must contain between 1 and 100 entries'
            when context.quantity is null or context.quantity <= 0 then
                'validation: quantity must be positive'
            when context.publication_status <> 'active'
              or context.workflow_phase <> 'ready'
              or not context.workflow_enabled
              or context.availability = 'unavailable'
              or context.accepted_price_amount is null then
                format('conflict: offer %s is not sellable', context.offer_id)
            when context.quantity_available is not null
              and context.quantity_available < context.quantity then
                format('conflict: insufficient quantity for offer %s', context.offer_id)
            when context.product_status <> 'active'
              or context.product_visibility <> 'public' then
                format('conflict: product for offer %s is not sellable', context.offer_id)
            when context.axis_count > 0 and context.variant_id is null then
                'validation: a product variant is required when the product has variant axes'
            when context.variant_id is not null and (
                context.variant_product_id is distinct from context.product_id
                or context.variant_status is distinct from 'active'
                or (context.axis_count > 0 and context.variant_combination_key is null)
            ) then 'validation: an active product variant is required'
            when context.axis_count > 0
              and context.selection_count <> context.axis_count then
                'validation: the product variant does not select every variant axis'
            when context.seller_cms_user_id = p_buyer_cms_user_id then
                'forbidden: buyers cannot purchase their own offer'
            when context.seller_verification_status in ('rejected', 'suspended')
              or (p_require_verified_seller
                and context.seller_verification_status <> 'verified') then
                format('conflict: seller for offer %s is not allowed to sell', context.offer_id)
            when p_mode = 'ecommerce' and context.seller_kind = 'user' then
                'conflict: marketplace offers are disabled'
            when not p_split_by_seller
              and context.seller_id <> context.first_seller_id then
                'conflict: one order cannot contain multiple sellers'
            when not p_split_by_seller
              and context.currency <> context.first_currency then
                'conflict: one order cannot contain multiple currencies'
            when context.cumulative_subtotal > 9007199254740991 then
                'validation: order total exceeds the supported maximum'
            else null
        end as validation_error
        from context
    )
    select
        (select item.validation_error from evaluated item
         where item.validation_error is not null
         order by item.batch_position, item.line_position limit 1),
        (select jsonb_agg(jsonb_build_object(
            'sellerId', summary.seller_id,
            'currency', summary.currency,
            'subtotal', summary.subtotal,
            'itemCount', summary.item_count,
            'error', summary.error_message
        ) order by summary.batch_position)
        from (
            select
                item.batch_position,
                case when p_split_by_seller then min(item.seller_id)
                    else min(item.first_seller_id) end as seller_id,
                case when p_split_by_seller then min(item.currency)
                    else min(item.first_currency) end as currency,
                max(item.cumulative_subtotal) as subtotal,
                max(item.batch_item_count) as item_count,
                (jsonb_agg(item.validation_error order by item.line_position)
                    filter (where item.validation_error is not null))->>0 as error_message
            from evaluated item
            group by item.batch_position
        ) summary);
end;
$$;