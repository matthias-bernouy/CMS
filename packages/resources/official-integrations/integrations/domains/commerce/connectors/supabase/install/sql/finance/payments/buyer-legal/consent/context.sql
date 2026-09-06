create or replace function commerce.get_buyer_consent_context(
    p_order_id bigint,
    p_buyer_cms_user_id text,
    p_payment_provider text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_attempt commerce.order_payment_attempts%rowtype;
begin
    if p_payment_provider is null or p_payment_provider !~ '^[a-z][a-z0-9_.-]{1,79}$' then
        raise exception 'validation: payment provider is invalid';
    end if;
    select * into v_order from commerce.orders
    where id = p_order_id and buyer_cms_user_id = p_buyer_cms_user_id;
    if not found then
        raise exception 'not_found: order';
    end if;
    select * into v_attempt from commerce.order_payment_attempts
    where order_id = v_order.id and provider = p_payment_provider
      and client_reference_id = v_order.public_id::text;
    return jsonb_build_object(
        'orderId', v_order.id,
        'orderPublicId', v_order.public_id,
        'checkoutGroupId', v_order.checkout_group_id,
        'buyerCmsUserId', v_order.buyer_cms_user_id,
        'paymentProvider', p_payment_provider,
        'operationKey', 'commerce:payment:' || p_payment_provider || ':' || v_order.public_id::text,
        'contexts', jsonb_build_array('buyer_checkout', 'protected_payment', commerce.buyer_legal_checkout_context(v_order.id)),
        'requiresConsent', v_order.status = 'awaiting_payment' and v_attempt.provider_payment_id is null
    );
end;
$$;
