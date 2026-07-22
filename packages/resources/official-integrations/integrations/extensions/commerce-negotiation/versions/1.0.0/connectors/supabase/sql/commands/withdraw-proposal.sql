

create or replace function commerce_negotiation.withdraw_proposal(
    p_proposal_id bigint,
    p_buyer_cms_user_id text,
    p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if not found then raise exception 'not_found: proposal'; end if;
    if v_proposal.buyer_cms_user_id <> p_buyer_cms_user_id then raise exception 'forbidden: proposal does not belong to this buyer'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status <> 'pending' then raise exception 'conflict: proposal is no longer pending'; end if;
    update commerce_negotiation.proposals
    set status = 'withdrawn', withdrawn_at = now()
    where id = v_proposal.id returning * into v_proposal;
    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
    ) values (v_proposal.id, 'withdrawn', 'buyer', p_buyer_cms_user_id, 'pending', 'withdrawn');
    return to_jsonb(v_proposal);
end;
$$;