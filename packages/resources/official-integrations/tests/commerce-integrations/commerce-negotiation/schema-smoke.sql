\set ON_ERROR_STOP on

begin;
set local role service_role;

select result->>'id' as first_id, result->>'version' as first_version
from (select commerce_negotiation.create_proposal(
    10, 'smoke-offer', 'Smoke offer', 'seller-1', 'Seller One', 'buyer-1',
    10000, 8000, 'EUR', 'First proposal'
) as result) created \gset

do $$
begin
    if (select minimum_amount from commerce_negotiation.proposals where buyer_cms_user_id = 'buyer-1') <> 8000
        or (select maximum_amount from commerce_negotiation.proposals where buyer_cms_user_id = 'buyer-1') <> 12000 then
        raise exception 'smoke: default bounds were not snapshotted';
    end if;
    begin
        perform commerce_negotiation.create_proposal(
            11, 'bounded-offer', 'Bounded offer', 'seller-1', 'Seller One', 'buyer-1',
            10000, 7999, 'EUR', null
        );
        raise exception 'smoke: out-of-range proposal was accepted';
    exception when others then
        if sqlerrm = 'smoke: out-of-range proposal was accepted'
            or sqlerrm not like 'validation: proposed amount must be between 8000 and 12000%' then
            raise;
        end if;
    end;
    begin
        perform commerce_negotiation.create_proposal(
            10, 'smoke-offer', 'Smoke offer', 'seller-1', 'Seller One', 'buyer-1',
            10000, 9000, 'EUR', null
        );
        raise exception 'smoke: duplicate pending proposal was accepted';
    exception when others then
        if sqlerrm = 'smoke: duplicate pending proposal was accepted'
            or sqlerrm not like 'conflict: a pending proposal already exists%' then
            raise;
        end if;
    end;
end;
$$;

select result->>'id' as second_id, result->>'version' as second_version
from (select commerce_negotiation.create_proposal(
    10, 'smoke-offer', 'Smoke offer', 'seller-1', 'Seller One', 'buyer-2',
    10000, 9500, 'EUR', null
) as result) created \gset

select result->>'version' as accepted_version
from (select commerce_negotiation.decide_proposal(
    :first_id, 'seller-1', 'accept', :first_version, 'Agreed'
) as result) decided \gset

do $$
begin
    if (
        select status from commerce_negotiation.proposals
        where buyer_cms_user_id = 'buyer-2' and commerce_offer_id = 10
    ) <> 'superseded' then
        raise exception 'smoke: competing proposal was not superseded';
    end if;
    begin
        perform commerce_negotiation.create_proposal(
            10, 'smoke-offer', 'Smoke offer', 'seller-1', 'Seller One', 'buyer-3',
            10000, 10000, 'EUR', null
        );
        raise exception 'smoke: proposal was allowed after an agreement';
    exception when others then
        if sqlerrm = 'smoke: proposal was allowed after an agreement'
            or sqlerrm not like 'conflict: this offer already has an accepted proposal%' then
            raise;
        end if;
    end;
    if (
        select count(*)
        from commerce_negotiation.proposal_events event
        join commerce_negotiation.proposals proposal on proposal.id = event.proposal_id
        where proposal.buyer_cms_user_id = 'buyer-1' and proposal.commerce_offer_id = 10
    ) <> 2 then
        raise exception 'smoke: proposal audit events are incomplete';
    end if;
    if (
        select count(*)
        from commerce_negotiation.proposal_events event
        join commerce_negotiation.proposals proposal on proposal.id = event.proposal_id
        where proposal.buyer_cms_user_id = 'buyer-2' and proposal.commerce_offer_id = 10
    ) <> 2 then
        raise exception 'smoke: superseded proposal audit event is missing';
    end if;
    if has_schema_privilege('anon', 'commerce_negotiation', 'usage')
        or has_schema_privilege('authenticated', 'commerce_negotiation', 'usage') then
        raise exception 'smoke: private negotiation schema is exposed';
    end if;
end;
$$;

rollback;
