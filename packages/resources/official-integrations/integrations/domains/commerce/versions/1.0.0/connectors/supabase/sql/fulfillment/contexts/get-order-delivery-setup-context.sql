

create or replace function commerce.get_order_delivery_setup_context(
    p_order_id bigint,
    p_buyer_cms_user_id text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when nullif(pg_catalog.btrim(p_buyer_cms_user_id), '') is null
            then jsonb_build_object('state', 'identity_required')
        else coalesce((
            select case
                when order_row.status = 'awaiting_quote'
                    and (
                        seller_row.id is null
                        or seller_row.kind <> 'user'
                        or seller_row.cms_user_id is null
                    )
                    then jsonb_build_object('state', 'seller_unavailable')
                else jsonb_build_object(
                    'state', 'ok',
                    'context', jsonb_build_object(
                        'order', jsonb_build_object(
                            'public_id', order_row.public_id,
                            'buyer_cms_user_id',
                                order_row.buyer_cms_user_id,
                            'status', order_row.status,
                            'version', order_row.version
                        ),
                        'authorization', case
                            when order_row.status = 'awaiting_quote'
                                then jsonb_build_object(
                                    'buyer_cms_user_id',
                                        order_row.buyer_cms_user_id,
                                    'status', order_row.status,
                                    'order_version', order_row.version,
                                    'seller_cms_user_id',
                                        seller_row.cms_user_id,
                                    'currency', order_row.currency,
                                    'merchandise_subtotal_minor_amount',
                                        order_row.subtotal_amount,
                                    'shipping_address',
                                        order_row.shipping_address
                                )
                            else 'null'::jsonb
                        end
                    )
                )
            end
            from commerce.orders order_row
            left join commerce.sellers seller_row
                on seller_row.id = order_row.seller_id
            where order_row.id = p_order_id
              and order_row.buyer_cms_user_id
                  = nullif(pg_catalog.btrim(p_buyer_cms_user_id), '')
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_order_delivery_setup_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_delivery_setup_context(
    bigint, text
) to service_role;