

create or replace function delivery.read_relay_selection_context(
    p_external_order_id text,
    p_selected_for_cms_user_id text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_selection delivery.relay_selections%rowtype;
    v_quote delivery.delivery_quotes%rowtype;
begin
    select selection.* into v_selection
    from delivery.relay_selections selection
    where selection.external_order_id = p_external_order_id;
    if found then
        return pg_catalog.jsonb_build_object(
            'outcome', 'selection',
            'row', pg_catalog.to_jsonb(v_selection)
        );
    end if;
    if nullif(pg_catalog.btrim(p_selected_for_cms_user_id), '') is null then
        return pg_catalog.jsonb_build_object('outcome', 'missing', 'row', null);
    end if;
    select quote.* into v_quote
    from delivery.delivery_quotes quote
    where quote.external_order_id = p_external_order_id
      and quote.selected_for_cms_user_id = p_selected_for_cms_user_id
    order by quote.revision desc
    limit 1;
    if not found then
        return pg_catalog.jsonb_build_object('outcome', 'missing', 'row', null);
    end if;
    return pg_catalog.jsonb_build_object(
        'outcome', 'quote',
        'row', pg_catalog.to_jsonb(v_quote)
            - 'recipient_snapshot'
            - 'seller_fulfillment_snapshot'
            - 'request_snapshot'
    );
end;
$$;

revoke execute on function delivery.read_relay_selection_context(text, text)
from public, anon, authenticated;
grant execute on function delivery.read_relay_selection_context(text, text)
to service_role;