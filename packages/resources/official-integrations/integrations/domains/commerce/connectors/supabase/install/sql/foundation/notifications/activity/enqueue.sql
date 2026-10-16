-- Shared private notification contract for offer and proposal lifecycle producers.
create or replace function commerce.enqueue_marketplace_notification(
    p_event_type text,
    p_source_event_id bigint,
    p_aggregate_type text,
    p_aggregate_id bigint,
    p_occurred_at timestamptz,
    p_context jsonb,
    p_recipient_ids text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_event_id bigint;
    v_key text := p_event_type || ':' || p_aggregate_type || ':' || p_source_event_id;
begin
    if coalesce((select mode from commerce.notification_configuration where id = 'default'), 'builtin') = 'disabled' then
        return;
    end if;
    if p_aggregate_type not in ('offer', 'proposal') or p_source_event_id <= 0
       or p_aggregate_id <= 0 or jsonb_typeof(p_context) is distinct from 'object' then
        raise exception 'validation: invalid marketplace notification context';
    end if;
    insert into commerce.notification_events (
        event_key, event_type, aggregate_type, aggregate_id,
        aggregate_version, occurred_at, payload
    ) values (
        v_key, p_event_type, p_aggregate_type, p_aggregate_id::text,
        p_source_event_id, p_occurred_at, jsonb_build_object('context', p_context)
    ) on conflict (event_key) do nothing returning id into v_event_id;
    if v_event_id is null then
        select id into v_event_id from commerce.notification_events where event_key = v_key;
    end if;
    insert into commerce.notification_deliveries (
        event_id, rule_key, recipient_cms_user_id, recipient_role
    )
    select distinct v_event_id, rule.key, btrim(recipient.id), rule.audience
    from commerce.notification_rules rule
    join commerce.notification_configuration configuration on configuration.id = 'default'
    cross join lateral unnest(case
        when rule.audience = 'admin' then configuration.admin_recipient_cms_user_ids
        else p_recipient_ids
    end) recipient(id)
    where rule.event_type = p_event_type and rule.enabled
      and nullif(btrim(recipient.id), '') is not null
    on conflict (event_id, rule_key, recipient_cms_user_id, channel) do nothing;
end;
$$;

revoke execute on function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[])
    from public, anon, authenticated;
grant execute on function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[])
    to service_role;
