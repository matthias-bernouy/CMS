\set ON_ERROR_STOP on
set statement_timeout = '15s';

\if :{?run_commerce_notification_install_contract}
    \if :run_commerce_notification_install_contract
        \ir install.pg.sql
    \endif
\endif

begin;

insert into commerce.orders (
    order_number, buyer_cms_user_id, status, currency,
    subtotal_amount, shipping_amount, total_amount
) values (
    'NTF-1001', 'buyer-1', 'active', 'eur', 10000, 500, 10500
) returning id \gset

insert into commerce.audit_events (
    order_id, aggregate_type, aggregate_id, event_type, actor_kind, actor_id
) values (
    :id, 'payment', 'payment-1', 'payment_succeeded', 'provider', 'stripe'
);

insert into commerce.notification_user_preferences (cms_user_id, rule_key, enabled)
values ('buyer-1', 'commerce.order.paid', false);

create temporary table claimed_required on commit drop as
select delivery_id, context
from commerce.claim_notifications('worker-1', 10);

do $required_delivery$
declare
    claimed record;
begin
    select * into claimed from claimed_required;
    if not found then
        raise exception 'required payment notification was suppressed';
    end if;
    if claimed.context #>> '{order,number}' <> 'NTF-1001'
       or claimed.context #>> '{recipient,userId}' <> 'buyer-1'
       or claimed.context #>> '{contractVersion}' <> '1' then
        raise exception 'stable template context changed: %', claimed.context;
    end if;
    begin
        perform commerce.complete_notification(claimed.delivery_id, 'another-worker', null);
        raise exception 'another worker completed an owned notification';
    exception
        when others then
            if sqlerrm = 'another worker completed an owned notification'
               or sqlerrm not like 'conflict:%' then
                raise;
            end if;
    end;
end;
$required_delivery$;

select commerce.complete_notification(
    (select delivery_id from claimed_required), 'worker-1', 'message-1'
);

insert into commerce.offers (slug, title)
values ('notification-agreement-offer', 'Notification agreement offer')
returning id as offer_id \gset agreement_offer_

insert into commerce.price_agreements (
    authority_version, offer_id, unit_amount, currency, quantity, status, expires_at
) values (
    2, :agreement_offer_offer_id, 12000, 'eur', 1, 'active', now() + interval '1 day'
)
returning id as agreement_id, public_id as agreement_public_id
\gset accepted_

insert into commerce.notification_events (
    event_key, event_type, aggregate_type, aggregate_id,
    aggregate_version, occurred_at
) values (
    'agreement-accepted-contract',
    'commerce.price_agreement.accepted',
    'price_agreement',
    :accepted_agreement_id::text,
    2,
    now()
) returning id as event_id \gset accepted_event_

insert into commerce.notification_deliveries (
    event_id, rule_key, recipient_cms_user_id
) values (
    :accepted_event_event_id,
    'commerce.price_agreement.accepted',
    'agreement-buyer'
);

create temporary table claimed_agreement on commit drop as
select *
from commerce.claim_notifications('agreement-worker', 10);

do $agreement_delivery$
declare
    claimed record;
    v_agreement_public_id text;
begin
    select agreement.public_id::text into strict v_agreement_public_id
    from commerce.price_agreements agreement
    join commerce.offers offer on offer.id = agreement.offer_id
    where offer.slug = 'notification-agreement-offer';
    select * into strict claimed
    from claimed_agreement
    where template_key = 'commerce.price_agreement.accepted';
    if claimed.context ? 'order'
       or claimed.context #>> '{agreement,id}' <> v_agreement_public_id
       or (claimed.context #>> '{agreement,unitAmountMinor}')::bigint <> 12000
       or claimed.context #>> '{agreement,subtotalAmountFormatted}' <> '120.00 EUR'
       or claimed.context #>> '{offer,slug}' <> 'notification-agreement-offer'
       or claimed.context #>> '{action,path}'
            <> '/checkout?agreementId=' || v_agreement_public_id then
        raise exception 'accepted agreement claim context changed: %', claimed.context;
    end if;
end;
$agreement_delivery$;

select commerce.complete_notification(
    (select delivery_id from claimed_agreement
     where template_key = 'commerce.price_agreement.accepted'),
    'agreement-worker',
    'agreement-message-1'
);

insert into commerce.audit_events (
    order_id, aggregate_type, aggregate_id, event_type, actor_kind, actor_id
) values (
    :id, 'fulfillment', 'fulfillment-1', 'fulfillment_in_transit', 'provider', 'carrier'
);
insert into commerce.notification_user_preferences (cms_user_id, rule_key, enabled)
values ('buyer-1', 'commerce.order.fulfillment.in_transit', false);

create temporary table claimed_optional on commit drop as
select *
from commerce.claim_notifications('worker-2', 10);

do $behavior$
begin
    if (select count(*) from claimed_optional) <> 0 then
        raise exception 'disabled optional notification was claimed';
    end if;
    if (
        select status
        from commerce.notification_deliveries
        where rule_key = 'commerce.order.fulfillment.in_transit'
    ) <> 'suppressed' then
        raise exception 'disabled optional notification was not suppressed';
    end if;
    if has_table_privilege('anon', 'commerce.notification_events', 'select')
       or has_table_privilege('authenticated', 'commerce.notification_events', 'select') then
        raise exception 'private notification events are exposed';
    end if;
    if not has_function_privilege(
        'service_role',
        'commerce.claim_notifications(text,integer,text)',
        'execute'
    ) then
        raise exception 'service role cannot claim notifications';
    end if;
    if has_function_privilege(
        'anon',
        'commerce.claim_notifications(text,integer,text)',
        'execute'
    ) or has_function_privilege(
        'authenticated',
        'commerce.claim_notifications(text,integer,text)',
        'execute'
    ) then
        raise exception 'notification queue functions are publicly executable';
    end if;
end;
$behavior$;

update commerce.orders set status = 'cancelled' where id = :id;
insert into commerce.audit_events (
    order_id, aggregate_type, aggregate_id, event_type, actor_kind, actor_id
) values (
    :id, 'refund', 'refund-1', 'refund_succeeded', 'provider', 'stripe'
);

create temporary table claimed_cancellation on commit drop as
select *
from commerce.claim_notifications('worker-3', 10);

do $cancellation_refund$
begin
    if (select count(*) from claimed_cancellation) <> 2
       or not exists (
           select 1 from claimed_cancellation where template_key = 'commerce.order.cancelled'
       )
       or not exists (
           select 1 from claimed_cancellation where template_key = 'commerce.order.refunded'
       ) then
        raise exception 'a refunded cancellation did not produce both required facts';
    end if;
end;
$cancellation_refund$;

update commerce.notification_configuration set mode = 'external' where id = 'default';
do $external_mode$
begin
    if (select count(*) from commerce.claim_notifications('builtin-worker', 10, 'builtin')) <> 0 then
        raise exception 'built-in worker claimed notifications while external mode was active';
    end if;
end;
$external_mode$;

update commerce.notification_configuration set mode = 'disabled' where id = 'default';
insert into commerce.audit_events (
    order_id, aggregate_type, aggregate_id, event_type, actor_kind, actor_id
) values (
    :id, 'fulfillment', 'fulfillment-2', 'fulfillment_lost', 'provider', 'carrier'
);
do $disabled_mode$
begin
    if exists (
        select 1 from commerce.notification_events where event_type = 'commerce.order.fulfillment.lost'
    ) then
        raise exception 'disabled notifications still captured a new event';
    end if;
end;
$disabled_mode$;

rollback;
