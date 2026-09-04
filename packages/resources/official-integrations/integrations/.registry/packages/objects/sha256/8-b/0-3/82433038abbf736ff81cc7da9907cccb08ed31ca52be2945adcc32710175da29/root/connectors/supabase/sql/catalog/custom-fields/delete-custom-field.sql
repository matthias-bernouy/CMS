

create or replace function commerce.delete_custom_field(
    p_entity_type text,
    p_key text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_definition commerce.custom_field_definitions%rowtype;
begin
    select * into v_definition
    from commerce.custom_field_definitions
    where entity_type = p_entity_type and key = p_key
    for update;
    if not found then raise exception 'not_found: custom field not found'; end if;

    if exists (
        select 1 from commerce.category_custom_fields
        where entity_type = p_entity_type and field_key = p_key
    ) then raise exception 'conflict: metadata is assigned to at least one category'; end if;

    if p_entity_type = 'product' and exists (
        select 1 from commerce.product_variant_axes where field_key = p_key
    ) then raise exception 'conflict: metadata is used as a product variant axis'; end if;

    if exists (
        select 1
        from (
            select metadata from commerce.products where p_entity_type = 'product'
            union all select metadata from commerce.product_variants where p_entity_type = 'variant'
            union all select metadata from commerce.sellers where p_entity_type = 'seller'
            union all select metadata from commerce.offers where p_entity_type = 'offer'
            union all select metadata from commerce.orders where p_entity_type = 'order'
        ) entity
        where entity.metadata ? p_key
    ) then raise exception 'conflict: metadata has existing values'; end if;

    delete from commerce.custom_field_definitions
    where entity_type = p_entity_type and key = p_key;
    return jsonb_build_object('entityType', p_entity_type, 'key', p_key, 'deleted', true);
end;
$$;