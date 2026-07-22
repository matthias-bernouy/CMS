

create or replace function commerce_negotiation.expire_pending_proposals()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    v_count integer;
begin
    with expired as (
        update commerce_negotiation.proposals
        set status = 'expired'
        where status = 'pending' and expires_at <= now()
        returning id, version
    ), events as (
        insert into commerce_negotiation.proposal_events (
            proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
        )
        select id, 'expired', 'system', 'expiration', 'pending', 'expired'
        from expired
        returning 1
    )
    select count(*) into v_count from events;
    return v_count;
end;
$$;