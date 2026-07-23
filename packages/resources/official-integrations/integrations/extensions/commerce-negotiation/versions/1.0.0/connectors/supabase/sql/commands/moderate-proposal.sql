

create or replace function commerce_negotiation.moderate_proposal(
    p_proposal_id bigint,
    p_admin_id text,
    p_expected_version integer,
    p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    select * into v_proposal from commerce_negotiation.proposals where id = p_proposal_id for update;
    if not found then raise exception 'not_found: proposal'; end if;
    if v_proposal.version <> p_expected_version then raise exception 'conflict: stale proposal version'; end if;
    if v_proposal.status not in ('pending', 'accepted') then raise exception 'conflict: proposal cannot be canceled'; end if;
    if v_proposal.status = 'accepted' and v_proposal.commerce_agreement_id is not null then
        perform commerce.cancel_price_agreement(
            'commerce-negotiation',
            v_proposal.public_id::text
        );
    end if;
    update commerce_negotiation.proposals
    set status = 'canceled', decision_message = nullif(btrim(p_reason), '')
    where id = v_proposal.id returning * into v_proposal;
    insert into commerce_negotiation.proposal_events (
        proposal_id, event_type, actor_kind, actor_id, previous_status, next_status, data
    ) values (
        v_proposal.id, 'canceled', 'admin', coalesce(nullif(btrim(p_admin_id), ''), 'cms-admin'),
        case when v_proposal.accepted_at is null then 'pending' else 'accepted' end, 'canceled',
        jsonb_build_object('reason', p_reason)
    );
    return commerce_negotiation.project_proposal(v_proposal);
end;
$$;
