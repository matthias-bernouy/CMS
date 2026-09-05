

create or replace function commerce.claim_provider_projection_event(
    p_authority text,
    p_provider_event_id text,
    p_order_id bigint,
    p_event_type text,
    p_occurred_at timestamptz,
    p_payload jsonb
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    v_id bigint;
    v_existing commerce.provider_projection_events%rowtype;
begin
    insert into commerce.provider_projection_events (
        authority, provider_event_id, order_id, event_type, occurred_at, payload
    ) values (
        p_authority, p_provider_event_id, p_order_id, p_event_type,
        p_occurred_at, coalesce(p_payload, '{}'::jsonb)
    ) on conflict (authority, provider_event_id) do nothing returning id into v_id;
    if v_id is not null then return v_id; end if;
    select * into v_existing from commerce.provider_projection_events
    where authority = p_authority and provider_event_id = p_provider_event_id;
    if v_existing.order_id is distinct from p_order_id
        or v_existing.event_type is distinct from p_event_type
        or v_existing.occurred_at is distinct from p_occurred_at
        or v_existing.payload is distinct from coalesce(p_payload, '{}'::jsonb) then
        raise exception 'conflict: provider event replay changed canonical payload';
    end if;
    return null;
end;
$$;