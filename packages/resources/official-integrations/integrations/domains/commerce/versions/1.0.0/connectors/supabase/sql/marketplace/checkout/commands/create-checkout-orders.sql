

create or replace function commerce.create_checkout_orders(
    p_checkout_group_id uuid,
    p_buyer_cms_user_id text,
    p_idempotency_key text,
    p_request_hash text,
    p_shipping_address jsonb,
    p_billing_address jsonb,
    p_metadata jsonb,
    p_order_summaries jsonb,
    p_items jsonb
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    v_order_ids jsonb;
begin
    with recursive order_plan as materialized (
        select item.ordinality::integer as position, item.value as summary
        from jsonb_array_elements(p_order_summaries) with ordinality item(value, ordinality)
    ),
    allocated as (
        select
            plan.position,
            plan.summary,
            nextval(pg_get_serial_sequence('commerce.orders', 'id')::regclass) as order_id
        from order_plan plan
        where plan.position = 1
        union all
        select
            plan.position,
            plan.summary,
            nextval(pg_get_serial_sequence('commerce.orders', 'id')::regclass)
        from allocated previous
        join order_plan plan on plan.position = previous.position + 1
    )
    insert into commerce.orders (
        id, order_number, checkout_group_id, seller_id, buyer_cms_user_id,
        currency, subtotal_amount, total_amount,
        shipping_address, billing_address, metadata,
        idempotency_key, request_hash, version
    )
    select
        allocated.order_id,
        'CO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24)),
        p_checkout_group_id,
        (allocated.summary->>'sellerId')::bigint,
        p_buyer_cms_user_id,
        allocated.summary->>'currency',
        (allocated.summary->>'subtotal')::bigint,
        (allocated.summary->>'subtotal')::bigint,
        p_shipping_address,
        p_billing_address,
        p_metadata,
        p_idempotency_key,
        p_request_hash,
        2
    from allocated
    order by allocated.position;

    select jsonb_agg(order_row.id order by order_row.seller_id)
    into v_order_ids
    from commerce.orders order_row
    where order_row.checkout_group_id = p_checkout_group_id;

    perform commerce.insert_order_batch_lines_and_reserve_inventory(
        v_order_ids, p_items
    );

    insert into commerce.order_events (
        order_id, event_type, actor_kind, actor_id, previous_status, next_status
    )
    select
        order_row.id, 'order_created', 'buyer',
        p_buyer_cms_user_id, null, 'awaiting_quote'
    from commerce.orders order_row
    where order_row.checkout_group_id = p_checkout_group_id
    order by order_row.id;
end;
$$;

revoke execute on function commerce.create_checkout_orders(
    uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function commerce.create_checkout_orders(
    uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;