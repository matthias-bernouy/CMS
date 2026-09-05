

create or replace function commerce.append_financial_event(
    p_order_id bigint,
    p_aggregate_type text,
    p_aggregate_id text,
    p_event_type text,
    p_actor_kind text,
    p_actor_id text,
    p_reason text,
    p_data jsonb,
    p_topic text,
    p_event_key text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
    insert into commerce.audit_events (
        order_id, aggregate_type, aggregate_id, event_type,
        actor_kind, actor_id, reason, data
    ) values (
        p_order_id, p_aggregate_type, p_aggregate_id, p_event_type,
        p_actor_kind, p_actor_id, p_reason, coalesce(p_data, '{}'::jsonb)
    );
    insert into commerce.outbox_events (order_id, topic, event_key, payload)
    values (
        p_order_id, p_topic, p_event_key,
        jsonb_build_object(
            'orderId', p_order_id,
            'aggregateType', p_aggregate_type,
            'aggregateId', p_aggregate_id,
            'eventType', p_event_type,
            'data', coalesce(p_data, '{}'::jsonb)
        )
    ) on conflict (event_key) do nothing;
end;
$$;