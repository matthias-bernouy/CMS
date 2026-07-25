create or replace function sales_configurator.public_proposal_items_json(
    p_proposal_version_id bigint
)
returns jsonb
language sql
stable
set search_path = ''
as $$
    with recursive item_tree as (
        select
            item.id,
            item.parent_item_id,
            null::integer as parent_sort_order,
            0 as depth,
            array[item.sort_order::bigint, item.id] as sort_path
        from sales_configurator.proposal_items item
        where item.proposal_version_id = p_proposal_version_id
          and item.parent_item_id is null
        union all
        select
            child.id,
            child.parent_item_id,
            parent_item.sort_order,
            parent.depth + 1,
            parent.sort_path || array[child.sort_order::bigint, child.id]
        from sales_configurator.proposal_items child
        join item_tree parent on parent.id = child.parent_item_id
        join sales_configurator.proposal_items parent_item
          on parent_item.id = child.parent_item_id
        where child.proposal_version_id = p_proposal_version_id
    )
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'parentSortOrder', item_tree.parent_sort_order,
                'depth', item_tree.depth,
                'kind', item.kind,
                'origin', item.origin,
                'code', item.code,
                'label', item.label,
                'description', item.description,
                'quantity', item.quantity,
                'pricingMode', item.pricing_mode,
                'unitAmountCents', item.unit_amount_cents,
                'currency', item.currency,
                'sortOrder', item.sort_order
            )
            order by item_tree.sort_path
        ),
        '[]'::jsonb
    )
    from item_tree
    join sales_configurator.proposal_items item on item.id = item_tree.id
$$;
