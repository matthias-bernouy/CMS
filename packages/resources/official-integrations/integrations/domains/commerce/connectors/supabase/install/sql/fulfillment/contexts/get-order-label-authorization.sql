

create or replace function commerce.get_order_label_authorization(
    p_order_public_id uuid,
    p_seller_cms_user_id text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'allowed', order_row.status = 'active'
        and fulfillment.status in ('label_created', 'seller_handoff_declared')
        and creation.status = 'succeeded'
        and not exists (select 1 from commerce.order_cancellation_requests request
            where request.order_id = order_row.id and request.status not in ('rejected', 'completed'))
        and not exists (select 1 from commerce.refund_requests request
            where request.order_id = order_row.id and request.status not in ('rejected', 'cancelled', 'failed')),
    'orderId', order_row.id, 'orderPublicId', order_row.public_id,
    'sellerCmsUserId', seller.cms_user_id, 'fulfillmentStatus', fulfillment.status,
    'providerReference', fulfillment.provider_reference
)
from commerce.orders order_row
join commerce.sellers seller on seller.id = order_row.seller_id
join commerce.order_fulfillments fulfillment on fulfillment.order_id = order_row.id
join commerce.shipment_creation_operations creation on creation.order_id = order_row.id
where order_row.public_id = p_order_public_id and seller.cms_user_id = p_seller_cms_user_id;
$$;