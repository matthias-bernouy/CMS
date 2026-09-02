

create or replace function commerce.restore_order_inventory(p_order_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
begin
    perform offer.id
    from commerce.offers offer
    join commerce.order_lines line on line.offer_id = offer.id
    where line.order_id = p_order_id
    order by offer.id
    for update of offer;
    update commerce.offers offer
    set quantity_available = offer.quantity_available + restored.quantity,
        availability = case
            when offer.availability = 'unavailable' and offer.quantity_available = 0
                and offer.inventory_revision = restored.inventory_revision_before
                then restored.availability_before
            else offer.availability
        end
    from (
        select offer_id, sum(inventory_reserved)::integer quantity,
            min(availability_before) availability_before,
            min(inventory_revision_before) inventory_revision_before
        from commerce.order_lines
        where order_id = p_order_id and inventory_reserved > 0
        group by offer_id
    ) restored
    where offer.id = restored.offer_id and offer.quantity_available is not null;
    update commerce.order_lines set
        inventory_reserved = 0,
        availability_before = null,
        inventory_revision_before = null
    where order_id = p_order_id and inventory_reserved > 0;
end;
$$;