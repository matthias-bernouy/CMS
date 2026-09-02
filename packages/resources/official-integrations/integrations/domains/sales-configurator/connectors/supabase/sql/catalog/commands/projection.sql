create or replace function sales_configurator.catalog_item_json(p_item_id bigint)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select pg_catalog.jsonb_build_object(
        'id', item.id,
        'kind', item.kind,
        'code', item.code,
        'name', item.name,
        'description', item.description,
        'status', item.status,
        'sortOrder', item.sort_order,
        'createdAt', item.created_at,
        'updatedAt', item.updated_at
    )
    from sales_configurator.catalog_items item
    where item.id = p_item_id
$$;
