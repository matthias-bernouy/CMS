

drop function if exists delivery.get_label_access_context(text, text, timestamptz);

create or replace function delivery.get_label_access_context(
    p_token_hash text,
    p_seller_cms_user_id text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_token delivery.label_access_tokens%rowtype;
    v_shipment record;
begin
    select token.* into v_token
    from delivery.label_access_tokens token
    where token.token_hash = p_token_hash
      and token.seller_cms_user_id = p_seller_cms_user_id;
    if not found or v_token.revoked_at is not null then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    if v_token.expires_at <= pg_catalog.clock_timestamp() then
        return pg_catalog.jsonb_build_object('state', 'expired');
    end if;

    select
        shipment.expedition_number,
        shipment.label_url,
        shipment.status
    into v_shipment
    from delivery.shipments shipment
    where shipment.id = v_token.shipment_id;
    if not found
       or v_shipment.label_url is null
       or v_shipment.label_url = ''
       or v_shipment.status in (
           'cancelled_unscanned', 'cancelled', 'manual_review'
       ) then
        return pg_catalog.jsonb_build_object('state', 'label_missing');
    end if;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'shipment', pg_catalog.jsonb_build_object(
            'expedition_number', v_shipment.expedition_number,
            'label_url', v_shipment.label_url
        )
    );
end;
$$;

revoke execute on function delivery.get_label_access_context(
    text, text
) from public, anon, authenticated;
grant execute on function delivery.get_label_access_context(
    text, text
) to service_role;