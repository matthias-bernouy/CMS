create or replace function commerce.buyer_legal_checkout_context(
    p_order_id bigint
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
    select case
        when exists (
            select 1
            from commerce.price_agreements agreement
            where agreement.order_id = p_order_id
        ) then 'negotiated_offer'
        when checkout.source_cart_id is not null then 'cart'
        else 'direct_purchase'
    end
    from commerce.orders order_row
    join commerce.checkout_groups checkout
      on checkout.id = order_row.checkout_group_id
    where order_row.id = p_order_id;
$$;
