

create or replace function delivery.declare_seller_handoff(
    p_external_order_id text,
    p_seller_cms_user_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_actor text := nullif(pg_catalog.btrim(p_seller_cms_user_id), '');
    v_shipment delivery.shipments%rowtype;
begin
    if v_actor is null then
        raise exception 'validation: seller CMS user id is required';
    end if;
    select shipment.* into v_shipment
    from delivery.shipments shipment
    where shipment.external_order_id = p_external_order_id
      and shipment.seller_cms_user_id = v_actor
    limit 1
    for update;
    if not found then
        raise exception 'not_found: shipment not found';
    end if;
    if v_shipment.seller_handoff_declared_at is null then
        if v_shipment.carrier_accepted_at is not null
            or v_shipment.status <> 'label_ready' then
            raise exception 'conflict: seller handoff cannot be declared for the current shipment state';
        end if;
        update delivery.shipments shipment set
            seller_handoff_declared_at = pg_catalog.now()
        where shipment.id = v_shipment.id
          and shipment.status = 'label_ready'
          and shipment.carrier_accepted_at is null
          and shipment.seller_handoff_declared_at is null
        returning shipment.* into v_shipment;
        if not found then
            raise exception 'conflict: shipment state changed while declaring seller handoff';
        end if;
    end if;
    return pg_catalog.jsonb_build_object(
        'id', v_shipment.id,
        'external_order_id', v_shipment.external_order_id,
        'expedition_number', v_shipment.expedition_number,
        'status', v_shipment.status,
        'carrier_accepted_at', v_shipment.carrier_accepted_at,
        'recipient_handoff_at', v_shipment.recipient_handoff_at,
        'seller_handoff_declared_at', v_shipment.seller_handoff_declared_at
    );
end;
$$;

revoke execute on function delivery.declare_seller_handoff(text, text)
    from public, anon, authenticated;
grant execute on function delivery.declare_seller_handoff(text, text)
    to service_role;