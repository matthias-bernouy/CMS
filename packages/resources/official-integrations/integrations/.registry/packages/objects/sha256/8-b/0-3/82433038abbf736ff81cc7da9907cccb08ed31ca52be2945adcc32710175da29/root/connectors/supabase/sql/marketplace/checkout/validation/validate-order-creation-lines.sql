

create or replace function commerce.validate_order_creation_lines(
    p_buyer_cms_user_id text,
    p_items jsonb,
    p_require_verified_seller boolean,
    p_mode text
)
returns table (
    error_message text,
    order_seller_id bigint,
    order_currency text,
    order_subtotal numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
    return query
    select
        plan.error_message,
        (plan.order_summaries->0->>'sellerId')::bigint,
        plan.order_summaries->0->>'currency',
        (plan.order_summaries->0->>'subtotal')::numeric
    from commerce.validate_order_creation_batches(
        p_buyer_cms_user_id, p_items,
        p_require_verified_seller, p_mode, false
    ) plan;
end;
$$;