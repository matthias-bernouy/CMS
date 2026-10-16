-- Execute the real seller/admin commands, including repeated publication.
select commerce.submit_my_offer(id, 'seller-1', version) from commerce.offers where slug = 'review-offer';
select pg_temp.assert_delivery('commerce.admin.offer.submitted', 'admin-1', 1);
select pg_temp.assert_delivery('commerce.admin.offer.submitted', 'admin-2', 1);
select commerce.review_offer(id, 'request_changes', 'admin-1', version, null, null, 'Add details')
from commerce.offers where slug = 'review-offer';
select pg_temp.assert_delivery('commerce.seller.offer.changes_requested', 'seller-1', 1);
select commerce.submit_my_offer(id, 'seller-1', version) from commerce.offers where slug = 'review-offer';
select commerce.review_offer(id, 'request_price', 'admin-1', version, 8000, 12000)
from commerce.offers where slug = 'review-offer';
select pg_temp.assert_delivery('commerce.seller.offer.price_requested', 'seller-1', 1);
select commerce.submit_offer_price(id, 'seller-1', 10000, version) from commerce.offers where slug = 'review-offer';
select pg_temp.assert_delivery('commerce.admin.offer.price_submitted', 'admin-1', 1);
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 0);
select commerce.review_offer(id, 'approve', 'admin-1', version) from commerce.offers where slug = 'review-offer';
select commerce.review_offer(id, 'publish', 'admin-1', version) from commerce.offers where slug = 'review-offer';
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 1);
select commerce.review_offer(id, 'reject', 'admin-1', version, null, null, 'Cannot publish')
from commerce.offers where slug = 'rejected-offer';
select pg_temp.assert_delivery('commerce.seller.offer.rejected', 'seller-1', 1);

-- Automatic price approval sends one approval, even if later published manually.
update commerce.settings set auto_approve_price_in_range = true, require_final_price_approval = false;
select commerce.review_offer(id, 'request_price', 'admin-1', version, 8000, 12000)
from commerce.offers where slug = 'automatic-offer';
select commerce.submit_offer_price(id, 'seller-1', 10000, version) from commerce.offers where slug = 'automatic-offer';
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 2);
select commerce.review_offer(id, 'publish', 'admin-1', version) from commerce.offers where slug = 'automatic-offer';
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 2);
select pg_temp.assert_delivery('commerce.admin.offer.price_submitted', 'admin-2', 2);

-- Repeated producer invocation cannot queue the same source event twice.
select commerce.enqueue_marketplace_notification(
    event.event_type, event.aggregate_version, event.aggregate_type, event.aggregate_id::bigint,
    event.occurred_at, event.payload->'context', array['seller-1']
) from commerce.notification_events event where event.event_type = 'commerce.seller.offer.approved';
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 2);

-- Custom review actions are recognized through ready workflow phases, not state names.
insert into commerce.offer_workflow_states (code, label, phase, position)
values ('custom_ready', 'Custom ready', 'ready', 90);
insert into commerce.offer_workflow_transitions (from_state, action, actor_kind, to_state)
values ('pending_review', 'custom_approve', 'admin', 'custom_ready');
insert into commerce.offers (seller_id, product_id, slug, title, workflow_state, accepted_price_amount, condition_code, currency)
select seller_id, product_id, 'custom-offer', 'Custom offer', 'pending_review', 10000, condition_code, currency
from commerce.offers where slug = 'review-offer';
select commerce.review_offer(id, 'custom_approve', 'admin-1', version)
from commerce.offers where slug = 'custom-offer';
select pg_temp.assert_delivery('commerce.seller.offer.approved', 'seller-1', 3);
