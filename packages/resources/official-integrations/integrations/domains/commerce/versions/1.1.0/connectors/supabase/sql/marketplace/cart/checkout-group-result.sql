

create or replace function commerce.checkout_group_result(
    p_checkout_group_id uuid,
    p_idempotent_replay boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $$
select jsonb_build_object(
    'checkout_group_id', p_checkout_group_id,
    'orders', coalesce(jsonb_agg((to_jsonb(orders) - 'request_hash') order by orders.id)
        filter (where orders.id is not null), '[]'::jsonb),
    'idempotent_replay', p_idempotent_replay
)
from commerce.orders
where checkout_group_id = p_checkout_group_id;
$$;