

create or replace function commerce.get_order_shipment_creation_seller_context(
    p_order_id bigint,
    p_seller_cms_user_id text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_order record;
    v_authorization jsonb;
begin
    if nullif(pg_catalog.btrim(p_seller_cms_user_id), '') is null then
        return pg_catalog.jsonb_build_object('state', 'identity_required');
    end if;
    select order_row.id, order_row.public_id,
        seller.cms_user_id as seller_cms_user_id
    into v_order
    from commerce.orders order_row
    join commerce.sellers seller on seller.id = order_row.seller_id
    where order_row.id = p_order_id
      and seller.cms_user_id
          = nullif(pg_catalog.btrim(p_seller_cms_user_id), '');
    if not found then
        return pg_catalog.jsonb_build_object('state', 'not_found');
    end if;
    v_authorization := commerce.get_order_fulfillment_authorization(
        v_order.public_id
    );
    -- Preserve the existing Source failure when this optional value is JSON
    -- null instead of the string required by the published endpoint contract.
    if v_authorization->'financialTermsHash' is not null
       and pg_catalog.jsonb_typeof(
           v_authorization->'financialTermsHash'
       ) is distinct from 'string' then
        return pg_catalog.jsonb_build_object(
            'state', 'invalid_authorization'
        );
    end if;
    return pg_catalog.jsonb_build_object(
        'state', 'ok',
        'context', pg_catalog.jsonb_build_object(
            'id', v_order.id,
            'public_id', v_order.public_id,
            'allowed', (v_authorization->>'allowed')::boolean,
            'seller_cms_user_id', v_order.seller_cms_user_id
        )
    );
end;
$$;

revoke execute on function commerce.get_order_shipment_creation_seller_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_shipment_creation_seller_context(
    bigint, text
) to service_role;