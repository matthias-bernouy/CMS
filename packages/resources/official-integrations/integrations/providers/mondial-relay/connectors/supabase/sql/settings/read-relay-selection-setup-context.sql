

create or replace function delivery.read_relay_selection_setup_context(
    p_external_order_id text,
    p_read_settings boolean
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_shipment_id delivery.shipments.id%type;
    v_settings delivery.settings%rowtype;
begin
    select shipment.id into v_shipment_id
    from delivery.shipments shipment
    where shipment.external_order_id = p_external_order_id
    limit 1;
    if found then
        return pg_catalog.jsonb_build_object(
            'outcome', 'shipment_exists',
            'settings', null
        );
    end if;
    if not coalesce(p_read_settings, false) then
        return pg_catalog.jsonb_build_object('outcome', 'ready', 'settings', null);
    end if;
    select settings.* into v_settings
    from delivery.settings settings
    where settings.id = 'default';
    return pg_catalog.jsonb_build_object(
        'outcome', 'ready',
        'settings', case when found then pg_catalog.to_jsonb(v_settings) else null end
    );
end;
$$;

revoke execute on function delivery.read_relay_selection_setup_context(text, boolean)
from public, anon, authenticated;
grant execute on function delivery.read_relay_selection_setup_context(text, boolean)
to service_role;