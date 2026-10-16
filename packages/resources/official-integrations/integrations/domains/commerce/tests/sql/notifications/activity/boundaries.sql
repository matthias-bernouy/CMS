-- Claim contexts must work without an order and retain the offer's event-time title.
update commerce.offers set title = 'Later edited title' where slug = 'review-offer';
create temporary table claimed as select * from commerce.claim_notifications('activity-worker', 50);
do $$
begin
    if (select count(*) from claimed) <> (select count(*) from commerce.notification_deliveries) then
        raise exception 'some lifecycle deliveries were claimed without a usable context';
    end if;
    if not exists (select 1 from claimed where template_key = 'commerce.seller.offer.approved'
        and context #>> '{offer,title}' = 'Review offer'
        and context #>> '{recipient,role}' = 'seller'
        and context #>> '{action,path}' like '/account/offers?offerId=%'
        and not context ? 'order') then
        raise exception 'offer snapshot or seller action path is incorrect';
    end if;
    if not exists (select 1 from claimed where template_key = 'commerce.buyer.proposal.expired'
        and context #>> '{proposal,previousStatus}' = 'accepted'
        and context #>> '{proposal,amountFormatted}' = '90.00 EUR'
        and context #>> '{action,path}' like '/account/negotiations?audience=buyer&proposalId=%') then
        raise exception 'proposal snapshot or buyer action path is incorrect';
    end if;
    if exists (select 1 from commerce.notification_deliveries where
        (recipient_role = 'admin' and recipient_cms_user_id not in ('admin-1', 'admin-2')) or
        (recipient_role = 'seller' and recipient_cms_user_id <> 'seller-1') or
        (recipient_role = 'buyer' and recipient_cms_user_id in ('seller-1', 'admin-1', 'admin-2'))) then
        raise exception 'recipient audience leaked';
    end if;
    if has_function_privilege('anon', 'commerce.enqueue_marketplace_notification(text,bigint,text,bigint,timestamptz,jsonb,text[])', 'execute')
       or has_function_privilege('authenticated', 'commerce_negotiation.capture_proposal_notification()', 'execute') then
        raise exception 'private lifecycle producers are public';
    end if;
end;
$$;

-- Disabled notifications, disabled rules, and missing recipients remain intentional no-ops.
update commerce.notification_configuration set mode = 'disabled';
select pg_temp.propose('expiry-offer', 'disabled-buyer');
select pg_temp.assert_delivery('commerce.seller.proposal.received', 'seller-1', 7);
do $$
begin
    if exists (select 1 from commerce.notification_events event
        join commerce_negotiation.proposals proposal on event.aggregate_type = 'proposal'
            and event.aggregate_id = proposal.id::text
        where proposal.buyer_cms_user_id = 'disabled-buyer') then
        raise exception 'disabled mode captured a lifecycle event';
    end if;
end;
$$;
update commerce.notification_configuration set mode = 'builtin', admin_recipient_cms_user_ids = '{}';
select commerce.enqueue_marketplace_notification('commerce.admin.offer.submitted', 100000, 'offer',
    (select id from commerce.offers where slug = 'review-offer'), now(),
    '{"offer":{"id":1,"slug":"review-offer","title":"Review offer"},"action":{"path":"/.cms/admin"}}', '{}');
select pg_temp.assert_delivery('commerce.admin.offer.submitted', 'admin-1', 2);
update commerce.notification_rules set enabled = false where key = 'commerce.seller.offer.rejected';
select commerce.enqueue_marketplace_notification('commerce.seller.offer.rejected', 100001, 'offer',
    (select id from commerce.offers where slug = 'review-offer'), now(),
    '{"offer":{"id":1,"slug":"review-offer","title":"Review offer"},"action":{"path":"/account/offers"}}', array['seller-1']);
select pg_temp.assert_delivery('commerce.seller.offer.rejected', 'seller-1', 1);
