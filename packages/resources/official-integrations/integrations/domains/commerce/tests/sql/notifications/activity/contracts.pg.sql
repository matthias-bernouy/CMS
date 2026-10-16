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
\ir :cms_integration_schema_bundle
\ir :cms_integration_schema_bundle
-- Simulate the previous installation: no lifecycle producer/rules and an order-only claim.
drop trigger commerce_capture_offer_notification on commerce.offer_events;
drop function commerce.capture_offer_notification();
drop function commerce.enqueue_marketplace_notification(text, bigint, text, bigint, timestamptz, jsonb, text[]);
delete from commerce.notification_rules where key like 'commerce.%.offer.%' or key like 'commerce.%.proposal.%';
\ir :legacy_notification_claim
\ir :marketplace_notifications_repeatable
\ir :marketplace_notifications_repeatable
begin;
set local role service_role;
\ir fixture.sql
\ir offers.sql
\ir proposals.sql
\ir boundaries.sql
reset role;
create temporary table before_upgrade as select count(*) as events from commerce.notification_events;
\ir :marketplace_notifications_repeatable
\ir :marketplace_notifications_repeatable
do $$
begin
    if (select count(*) from commerce.notification_events) <> (select events from before_upgrade) then
        raise exception 'upgrade replayed historical events';
    end if;
    if (select enabled from commerce.notification_rules where key = 'commerce.seller.offer.rejected') then
        raise exception 'upgrade re-enabled an administrator-disabled rule';
    end if;
end;
$$;
rollback;
