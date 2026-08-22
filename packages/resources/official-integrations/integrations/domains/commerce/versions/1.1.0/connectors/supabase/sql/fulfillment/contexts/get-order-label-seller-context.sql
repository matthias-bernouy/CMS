

create or replace function commerce.get_order_label_seller_context(
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
                    'public_id', order_row.public_id,
                    'allowed', order_row.status = 'active'
                        and fulfillment.status in (
                            'label_created', 'seller_handoff_declared'
                        )
                        and creation.status = 'succeeded'
                        and not exists (
                            select 1
                            from commerce.order_cancellation_requests request
                            where request.order_id = order_row.id
                              and request.status not in (
                                  'rejected', 'completed'
                              )
                        )
                        and not exists (
                            select 1
                            from commerce.refund_requests request
                            where request.order_id = order_row.id
                              and request.status not in (
                                  'rejected', 'cancelled', 'failed'
                              )
                        ),
                    'seller_cms_user_id', seller.cms_user_id
                )
            )
            from commerce.orders order_row
            join commerce.sellers seller on seller.id = order_row.seller_id
            join commerce.order_fulfillments fulfillment
                on fulfillment.order_id = order_row.id
            join commerce.shipment_creation_operations creation
                on creation.order_id = order_row.id
            where order_row.id = p_order_id
              and seller.cms_user_id
                  = nullif(pg_catalog.btrim(p_seller_cms_user_id), '')
        ), jsonb_build_object('state', 'not_found'))
    end;
$$;

revoke execute on function commerce.get_order_label_seller_context(
    bigint, text
) from public, anon, authenticated;
grant execute on function commerce.get_order_label_seller_context(
    bigint, text
) to service_role;