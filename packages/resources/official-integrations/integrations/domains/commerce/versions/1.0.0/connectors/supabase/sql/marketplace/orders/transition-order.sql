

create or replace function commerce.transition_order(
    p_order_id bigint,
    p_next_status text,
    p_admin_id text,
    p_expected_version integer,
    p_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_order commerce.orders%rowtype; v_previous text;
begin
    raise exception 'conflict: generic order transitions were removed; use an explicit protected command';
    select * into v_order from commerce.orders where id = p_order_id for update;
    if not found then raise exception 'not_found: order'; end if;
    if v_order.version is distinct from p_expected_version then raise exception 'conflict: stale order version'; end if;
    if not (
        (v_order.status = 'placed' and p_next_status in ('cancelled', 'completed'))
        or (v_order.status in ('cancelled', 'completed') and p_next_status = 'archived')
    ) then raise exception 'conflict: order transition is not allowed'; end if;
    v_previous := v_order.status;
    if v_previous = 'placed' and p_next_status = 'cancelled' then
        perform offer.id
        from commerce.offers offer
        join commerce.order_lines line on line.offer_id = offer.id
        where line.order_id = v_order.id
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
            select
                offer_id,
                sum(inventory_reserved)::integer as quantity,
                min(availability_before) as availability_before,
                min(inventory_revision_before) as inventory_revision_before
            from commerce.order_lines
            where order_id = v_order.id
              and inventory_reserved > 0
            group by offer_id
        ) restored
        where offer.id = restored.offer_id
          and offer.quantity_available is not null;
    end if;
    update commerce.orders set status = p_next_status where id = p_order_id returning * into v_order;
    insert into commerce.order_events (
        order_id, event_type, actor_kind, actor_id, previous_status, next_status, message
    ) values (
        v_order.id, 'status_changed', 'admin', coalesce(nullif(p_admin_id, ''), 'cms-admin'),
        v_previous, p_next_status, p_message
    );
    return to_jsonb(v_order);
end;
$$;