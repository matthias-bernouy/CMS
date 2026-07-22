

create or replace function commerce.review_order_cancellation(
    p_request_id bigint,
    p_decision text,
    p_actor_id text,
    p_reason text
)
returns jsonb
language sql
set search_path = ''
as $$
select commerce.review_order_cancellation_as(
    p_request_id, p_decision, 'admin', p_actor_id, p_reason
);
$$;