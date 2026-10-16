create function pg_temp.propose(p_offer_slug text, p_buyer text)
returns jsonb language plpgsql as $$
declare v_offer commerce.offers%rowtype;
begin
    select * into strict v_offer from commerce.offers where slug = p_offer_slug;
    return commerce_negotiation.create_proposal(v_offer.id, v_offer.slug, v_offer.title,
        'seller-1', 'Seller One', p_buyer, 10000, 9000, 'eur');
end;
$$;
select pg_temp.propose('negotiation-offer', 'rejected-buyer');
select pg_temp.assert_delivery('commerce.seller.proposal.received', 'seller-1', 1);
select commerce_negotiation.decide_proposal(id, 'seller-1', 'reject', version, 'Too low')
from commerce_negotiation.proposals where buyer_cms_user_id = 'rejected-buyer';
select pg_temp.assert_delivery('commerce.buyer.proposal.rejected', 'rejected-buyer', 1);
select pg_temp.propose('negotiation-offer', 'withdrawn-buyer');
select commerce_negotiation.withdraw_proposal(id, 'withdrawn-buyer', version)
from commerce_negotiation.proposals where buyer_cms_user_id = 'withdrawn-buyer';
select pg_temp.assert_delivery('commerce.seller.proposal.withdrawn', 'seller-1', 1);
select pg_temp.propose('negotiation-offer', 'expired-buyer');
update commerce_negotiation.proposals set created_at = now() - interval '2 days', expires_at = now() - interval '1 second'
where buyer_cms_user_id = 'expired-buyer';
select commerce_negotiation.expire_pending_proposals();
select commerce_negotiation.expire_pending_proposals();
select pg_temp.assert_delivery('commerce.buyer.proposal.expired', 'expired-buyer', 1);
select pg_temp.assert_delivery('commerce.seller.proposal.expired', 'seller-1', 1);
select pg_temp.propose('negotiation-offer', 'canceled-buyer');
select commerce_negotiation.moderate_proposal(id, 'admin-1', version, 'Moderation')
from commerce_negotiation.proposals where buyer_cms_user_id = 'canceled-buyer';
select pg_temp.assert_delivery('commerce.buyer.proposal.canceled', 'canceled-buyer', 1);
select pg_temp.assert_delivery('commerce.seller.proposal.canceled', 'seller-1', 1);
select pg_temp.propose('negotiation-offer', 'superseded-buyer');
select pg_temp.propose('negotiation-offer', 'accepted-buyer');
select commerce_negotiation.decide_proposal(id, 'seller-1', 'accept', version)
from commerce_negotiation.proposals where buyer_cms_user_id = 'accepted-buyer';
select pg_temp.assert_delivery('commerce.buyer.proposal.superseded', 'superseded-buyer', 1);
select pg_temp.assert_delivery('commerce.price_agreement.accepted', 'accepted-buyer', 1);
select pg_temp.assert_delivery('commerce.buyer.proposal.superseded', 'accepted-buyer', 0);

-- Expiry of an accepted checkout retains its previous status in the snapshot.
select pg_temp.propose('expiry-offer', 'checkout-expired-buyer');
select commerce_negotiation.decide_proposal(id, 'seller-1', 'accept', version)
from commerce_negotiation.proposals where buyer_cms_user_id = 'checkout-expired-buyer';
update commerce_negotiation.proposals set checkout_expires_at = now() - interval '1 second'
where buyer_cms_user_id = 'checkout-expired-buyer';
select commerce_negotiation.expire_pending_proposals();
select pg_temp.assert_delivery('commerce.buyer.proposal.expired', 'checkout-expired-buyer', 1);
select pg_temp.assert_delivery('commerce.seller.proposal.expired', 'seller-1', 2);
select commerce_negotiation.moderate_proposal(id, 'admin-1', version)
from commerce_negotiation.proposals where buyer_cms_user_id = 'accepted-buyer';
select pg_temp.assert_delivery('commerce.buyer.proposal.canceled', 'accepted-buyer', 1);
select pg_temp.assert_delivery('commerce.seller.proposal.canceled', 'seller-1', 2);
