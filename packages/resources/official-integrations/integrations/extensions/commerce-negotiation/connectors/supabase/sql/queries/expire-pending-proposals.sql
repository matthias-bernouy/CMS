

create or replace function commerce_negotiation.expire_pending_proposals()
returns integer
language plpgsql
set search_path = ''
as $$
declare
    v_count integer;
begin
    with candidates as materialized (
        select
            proposal.id,
            proposal.status previous_status,
            agreement.id agreement_id
        from commerce_negotiation.proposals proposal
        left join commerce.price_agreements agreement
          on agreement.public_id = proposal.commerce_agreement_id
        where (proposal.status = 'pending' and proposal.expires_at <= now())
           or (
               proposal.status = 'accepted'
               and proposal.commerce_agreement_id is not null
               and agreement.status in ('active', 'expired')
               and (
                   (
                       agreement.status = 'active'
                       and (
                           proposal.checkout_expires_at <= now()
                           or agreement.expires_at <= now()
                       )
                   )
                   or agreement.status = 'expired'
               )
           )
        for update of proposal
    ), expired_agreements as (
        update commerce.price_agreements agreement
        set status = 'expired'
        from candidates
        where agreement.id = candidates.agreement_id
          and agreement.status = 'active'
        returning agreement.id
    ), expired as (
        update commerce_negotiation.proposals proposal
        set status = 'expired'
        from candidates
        where proposal.id = candidates.id
        returning proposal.id, candidates.previous_status
    ), events as (
        insert into commerce_negotiation.proposal_events (
            proposal_id, event_type, actor_kind, actor_id, previous_status, next_status
        )
        select id, 'expired', 'system', 'expiration', previous_status, 'expired'
        from expired
        returning 1
    )
    select count(*) into v_count from events;
    perform commerce.expire_price_agreements();
    return v_count;
end;
$$;
