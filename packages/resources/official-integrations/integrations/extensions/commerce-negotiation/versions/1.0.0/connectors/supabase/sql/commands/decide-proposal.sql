

create or replace function commerce_negotiation.decide_proposal(
    p_proposal_id bigint,
    p_seller_cms_user_id text,
    p_action text,
    p_expected_version integer,
    p_message text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
    v_offer_id bigint;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select commerce_offer_id into v_offer_id
    from commerce_negotiation.proposals
    where id = p_proposal_id;
    if not found then raise exception 'not_found: proposal'; end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce_negotiation.offer:' || v_offer_id::text, 0));
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if v_proposal.seller_cms_user_id <> p_seller_cms_user_id then raise exception 'forbidden: proposal does not belong to this seller'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status <> 'pending' then raise exception 'conflict: proposal is no longer pending'; end if;
    if p_action not in ('accept', 'reject') then raise exception 'validation: action must be accept or reject'; end if;

    if p_action = 'accept' then
        if exists (
            select 1
            from commerce_negotiation.proposals
            where commerce_offer_id = v_proposal.commerce_offer_id
                and status = 'accepted'
                and id <> v_proposal.id
        ) then
            raise exception 'conflict: this offer already has an accepted proposal';
        end if;
        with superseded as (
            update commerce_negotiation.proposals
            set status = 'superseded'
            where commerce_offer_id = v_proposal.commerce_offer_id
                and status = 'pending'
                and id <> v_proposal.id
            returning id
        )
        insert into commerce_negotiation.proposal_events (
            proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
        )
        select id, 'superseded', 'seller', p_seller_cms_user_id, 'pending', 'superseded'
        from superseded;
        update commerce_negotiation.proposals
        set status = 'accepted', accepted_at = now(), decision_message = nullif(btrim(p_message), '')
        where id = v_proposal.id returning * into v_proposal;
    else
        update commerce_negotiation.proposals
        set status = 'rejected', rejected_at = now(), decision_message = nullif(btrim(p_message), '')
        where id = v_proposal.id returning * into v_proposal;
    end if;

    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status, data
    ) values (
        v_proposal.id, case when p_action = 'accept' then 'accepted' else 'rejected' end,
        'seller', p_seller_cms_user_id, 'pending', v_proposal.status,
        jsonb_build_object('message', p_message)
    );
    return to_jsonb(v_proposal);
end;
$$;