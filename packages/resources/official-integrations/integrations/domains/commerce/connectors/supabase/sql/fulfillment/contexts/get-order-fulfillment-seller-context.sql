

create or replace function commerce.get_order_fulfillment_seller_context(
    p_order_id bigint,
    p_seller_cms_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when nullif(pg_catalog.btrim(p_seller_cms_user_id), '') is null
            then jsonb_build_object('state', 'identity_required')
        else coalesce((
            select jsonb_build_object(
                'state', 'ok',
                'context', jsonb_build_object(
                    'id', order_row.id,
                    'public_id', order_row.public_id,
                    'order_number', order_row.order_number
                )
            )
            from commerce.orders order_row
            join commerce.sellers seller on seller.id = order_row.seller_id
            where order_row.id = p_order_id
              and seller.cms_user_id
                  = nullif(pg_catalog.btrim(p_seller_cms_user_id), '')
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_order_fulfillment_seller_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_fulfillment_seller_context(
    bigint, text
) to service_role;