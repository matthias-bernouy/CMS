\set ON_ERROR_STOP on
set statement_timeout = '15s';
drop schema if exists commerce_negotiation cascade;
drop schema if exists commerce cascade;
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
\ir :commerce_schema_bundle
drop function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[]);
-- Install and rerun Negotiation while the new Commerce capability is absent.
\ir :negotiation_schema_bundle
\ir :negotiation_schema_bundle
begin;
set local role service_role;
insert into commerce.sellers (kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by)
values ('user', 'seller-1', 'capability-seller', 'Seller One', 'verified', now(), 'contract');
insert into commerce.products (slug, title, status, visibility)
values ('capability-product', 'Capability product', 'active', 'public');
insert into commerce.offers (seller_id, product_id, slug, title, condition_code, currency, workflow_state,
    publication_status, accepted_price_amount, quantity_available)
select seller.id, product.id, fixtures.slug, 'Capability offer', 'good', 'eur', 'approved', 'active', 10000, 1
from (values ('rejected-capability-offer'), ('accepted-capability-offer')) fixtures(slug)
cross join commerce.sellers seller cross join commerce.products product
where seller.cms_user_id = 'seller-1' and product.slug = 'capability-product';
select commerce_negotiation.create_proposal(id, slug, title, 'seller-1', 'Seller One',
    'legacy-rejected-buyer', 10000, 9000, 'eur')
from commerce.offers where slug = 'rejected-capability-offer';
select commerce_negotiation.decide_proposal(id, 'seller-1', 'reject', version, 'Too low')
from commerce_negotiation.proposals where buyer_cms_user_id = 'legacy-rejected-buyer';
select commerce_negotiation.create_proposal(id, slug, title, 'seller-1', 'Seller One',
    'legacy-accepted-buyer', 10000, 9000, 'eur')
from commerce.offers where slug = 'accepted-capability-offer';
select commerce_negotiation.decide_proposal(id, 'seller-1', 'accept', version)
from commerce_negotiation.proposals where buyer_cms_user_id = 'legacy-accepted-buyer';
do $$
begin
    if exists (select 1 from commerce.notification_deliveries where rule_key like 'commerce.%.proposal.%') then
        raise exception 'Negotiation used the unavailable lifecycle capability';
    end if;
    if (select count(*) from commerce.notification_deliveries
        where rule_key = 'commerce.price_agreement.accepted' and recipient_cms_user_id = 'legacy-accepted-buyer') <> 1 then
        raise exception 'Existing acceptance notifications regressed';
    end if;
end;
$$;
reset role;
-- Upgrading Commerce activates the already-installed Negotiation producer.
\ir :marketplace_notifications_repeatable
set local role service_role;
select commerce_negotiation.create_proposal(id, slug, title, 'seller-1', 'Seller One',
    'upgraded-buyer', 10000, 9000, 'eur')
from commerce.offers where slug = 'rejected-capability-offer';
select commerce_negotiation.decide_proposal(id, 'seller-1', 'reject', version, 'Too low')
from commerce_negotiation.proposals where buyer_cms_user_id = 'upgraded-buyer';
do $$
begin
    if (select count(*) from commerce.notification_deliveries
        where rule_key = 'commerce.seller.proposal.received' and recipient_cms_user_id = 'seller-1') <> 1 then
        raise exception 'Commerce upgrade did not activate seller notifications';
    end if;
    if (select count(*) from commerce.notification_deliveries
        where rule_key = 'commerce.buyer.proposal.rejected' and recipient_cms_user_id = 'upgraded-buyer') <> 1 then
        raise exception 'Commerce upgrade did not activate buyer notifications';
    end if;
end;
$$;
rollback;
