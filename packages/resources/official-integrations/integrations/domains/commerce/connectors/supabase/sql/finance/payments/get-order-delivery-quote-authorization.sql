

create or replace function commerce.get_order_delivery_quote_authorization(
    p_public_id uuid,
    p_buyer_cms_user_id text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_seller commerce.sellers%rowtype;
begin
    select * into v_order from commerce.orders
    where public_id = p_public_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then raise exception 'not_found: order'; end if;
    if v_order.status <> 'awaiting_quote' then
        raise exception 'conflict: order is not awaiting a delivery quote';
    end if;
    select * into v_seller from commerce.sellers where id = v_order.seller_id;
    if not found or v_seller.kind <> 'user' or v_seller.cms_user_id is null then
        raise exception 'conflict: protected delivery requires a C2C user seller';
    end if;
    return jsonb_build_object(
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'orderVersion', v_order.version,
        'status', v_order.status,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'sellerCmsUserId', v_seller.cms_user_id,
        'currency', v_order.currency,
        'merchandiseSubtotalMinorAmount', v_order.subtotal_amount,
        'shippingAddress', v_order.shipping_address
    );
end;
$$;