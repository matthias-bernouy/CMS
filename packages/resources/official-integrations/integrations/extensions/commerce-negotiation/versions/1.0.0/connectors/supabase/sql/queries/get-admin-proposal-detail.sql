

create or replace function commerce_negotiation.get_admin_proposal_detail(
    p_id bigint default null,
    p_public_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_proposal commerce_negotiation.proposals%rowtype;
begin
    perform commerce_negotiation.expire_pending_proposals();
    select proposal.* into v_proposal
    from commerce_negotiation.proposals proposal
    where case when p_id is not null then proposal.id = p_id
        else proposal.public_id = p_public_id end
    limit 1;
    if not found then return null; end if;
    return jsonb_build_object(
        'proposal', to_jsonb(v_proposal),
        'events', coalesce((
            select jsonb_agg(to_jsonb(event) order by event.created_at asc)
            from commerce_negotiation.proposal_events event
            where event.proposal_id = v_proposal.id
        ), '[]'::jsonb)
    );
end;
$$;