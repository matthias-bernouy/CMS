create or replace function commerce.capture_notification_audit_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_order commerce.orders%rowtype;
    v_event_type text;
    v_event_types text[] := '{}';
    v_event_key text;
    v_event_id bigint;
    v_available_at timestamptz;
begin
    if new.order_id is null or coalesce((
        select configuration.mode
        from commerce.notification_configuration configuration
        where configuration.id = 'default'
    ), 'builtin') = 'disabled' then
        return new;
    end if;
    select * into v_order from commerce.orders where id = new.order_id;
    if not found then
        return new;
    end if;

    v_event_type := case new.event_type
        when 'payment_succeeded' then 'commerce.order.paid'
        when 'refund_succeeded' then 'commerce.order.refunded'
        when 'fulfillment_carrier_accepted' then 'commerce.order.fulfillment.carrier_accepted'
        when 'fulfillment_in_transit' then 'commerce.order.fulfillment.in_transit'
        when 'fulfillment_available_for_pickup' then 'commerce.order.fulfillment.available_for_pickup'
        when 'fulfillment_collected_by_recipient' then 'commerce.order.fulfillment.collected_by_recipient'
        when 'fulfillment_incident' then 'commerce.order.fulfillment.incident'
        when 'fulfillment_lost' then 'commerce.order.fulfillment.lost'
        when 'fulfillment_returning_to_sender' then 'commerce.order.fulfillment.returning_to_sender'
        when 'fulfillment_returned_to_sender' then 'commerce.order.fulfillment.returned_to_sender'
        when 'fulfillment_pickup_expired' then 'commerce.buyer.order.fulfillment.pickup_expired'
        else null
    end;
    if v_event_type is not null then
        v_event_types := array_append(v_event_types, v_event_type);
    end if;

    if new.event_type = 'payment_succeeded' then
        v_event_types := array_append(v_event_types, 'commerce.seller.sale.paid');
        if exists (
            select 1
            from commerce.order_fulfillments fulfillment
            where fulfillment.order_id = v_order.id
              and fulfillment.seller_handoff_deadline > new.created_at
        ) then
            v_event_types := array_append(v_event_types, 'commerce.seller.sale.shipment_reminder');
        end if;
    end if;
    if new.event_type = 'refund_requested' then
        v_event_types := array_append(v_event_types, 'commerce.buyer.order.refund_started');
        v_event_types := array_append(v_event_types, 'commerce.seller.sale.refund_started');
        if new.data @> '{"requiresFinanceApproval": true}'::jsonb then
            v_event_types := array_append(v_event_types, 'commerce.admin.action_required');
        end if;
    elsif new.event_type = 'refund_succeeded' then
        v_event_types := array_append(v_event_types, 'commerce.seller.sale.refunded');
    elsif new.event_type in (
        'refund_failed', 'refund_cancelled', 'refund_manual_review', 'refund_rejected'
    ) then
        v_event_types := array_append(v_event_types, 'commerce.buyer.order.refund_failed');
        v_event_types := array_append(v_event_types, 'commerce.admin.action_required');
    end if;

    if new.event_type = 'claim_opened' then
        v_event_types := array_append(v_event_types, 'commerce.buyer.claim.updated');
        v_event_types := array_append(v_event_types, 'commerce.seller.claim.action_required');
    elsif new.event_type in (
        'claim_seller_responded', 'claim_resolution_decided',
        'claim_seller_response_deadline', 'claim_return_ship_deadline'
    ) or new.event_type like 'claim_return_delivery_%' then
        v_event_types := array_append(v_event_types, 'commerce.buyer.claim.updated');
        v_event_types := array_append(v_event_types, 'commerce.seller.claim.updated');
        if new.event_type in (
            'claim_seller_responded', 'claim_seller_response_deadline', 'claim_return_ship_deadline'
        ) then
            v_event_types := array_append(v_event_types, 'commerce.admin.action_required');
        end if;
    end if;

    if new.event_type like 'cancellation_%'
       and new.event_type not in ('cancellation_completed', 'cancellation_rejected') then
        if new.actor_kind in ('buyer', 'system') then
            v_event_types := array_append(v_event_types, 'commerce.seller.sale.cancellation_started');
        end if;
        if new.actor_kind in ('seller', 'system') then
            v_event_types := array_append(v_event_types, 'commerce.buyer.order.cancellation_started');
        end if;
    end if;

    if new.event_type in (
        'fulfillment_incident', 'fulfillment_lost', 'fulfillment_pickup_expired',
        'fulfillment_returning_to_sender', 'fulfillment_returned_to_sender',
        'fulfillment_collected_by_recipient'
    ) then
        v_event_types := array_append(v_event_types, 'commerce.seller.sale.fulfillment.updated');
    elsif new.event_type = 'seller_handoff_deadline_elapsed' then
        v_event_types := array_append(v_event_types, 'commerce.seller.sale.shipment_deadline_elapsed');
        v_event_types := array_append(v_event_types, 'commerce.admin.action_required');
    elsif new.event_type = 'scan_grace_manual_review' then
        v_event_types := array_append(v_event_types, 'commerce.admin.action_required');
    end if;

    if v_order.status = 'cancelled' and new.event_type in (
        'cancellation_completed',
        'payment_cancellation_requested',
        'payment_cancellation_provider_confirmed',
        'payment_cancellation_provider_absent',
        'shipment_cancellation_confirmed',
        'refund_succeeded'
    ) then
        v_event_types := array_append(v_event_types, 'commerce.order.cancelled');
    end if;
    if cardinality(v_event_types) = 0 then
        return new;
    end if;

    foreach v_event_type in array v_event_types loop
        v_event_id := null;
        v_event_key := case
            when v_event_type in (
                'commerce.order.paid', 'commerce.seller.sale.paid',
                'commerce.seller.sale.shipment_reminder', 'commerce.order.cancelled'
            ) then v_event_type || ':' || new.order_id
            when v_event_type in ('commerce.order.refunded', 'commerce.seller.sale.refunded')
                then v_event_type || ':' || new.aggregate_id
            else v_event_type || ':' || new.id
        end;
        insert into commerce.notification_events (
            event_key, contract_version, event_type, aggregate_type,
            aggregate_id, aggregate_version, occurred_at, payload
        ) values (
            v_event_key, 1, v_event_type, 'order', new.order_id::text,
            new.id, new.created_at,
            jsonb_build_object(
                'sourceAggregateType', new.aggregate_type,
                'sourceAggregateId', new.aggregate_id,
                'sourceEventId', new.id,
                'sourceEventType', new.event_type,
                'data', new.data
            )
        )
        on conflict (event_key) do nothing
        returning id into v_event_id;
        if v_event_id is null then
            select id into v_event_id
            from commerce.notification_events
            where event_key = v_event_key;
        end if;

        v_available_at := new.created_at;
        if v_event_type = 'commerce.seller.sale.shipment_reminder' then
            select greatest(
                new.created_at + interval '1 hour',
                fulfillment.seller_handoff_deadline - interval '24 hours'
            ) into v_available_at
            from commerce.order_fulfillments fulfillment
            where fulfillment.order_id = v_order.id;
        end if;

        insert into commerce.notification_deliveries (
            event_id, rule_key, recipient_cms_user_id, recipient_role, available_at
        )
        select
            v_event_id,
            rule.key,
            recipient.cms_user_id,
            rule.audience,
            v_available_at
        from commerce.notification_rules rule
        cross join lateral (
            select v_order.buyer_cms_user_id as cms_user_id
            where rule.audience = 'buyer'
            union all
            select seller.cms_user_id
            from commerce.sellers seller
            where rule.audience = 'seller'
              and seller.id = v_order.seller_id
              and seller.cms_user_id is not null
            union all
            select administrator.cms_user_id
            from commerce.notification_configuration configuration
            cross join lateral unnest(configuration.admin_recipient_cms_user_ids)
                administrator(cms_user_id)
            where rule.audience = 'admin'
              and configuration.id = 'default'
              and length(btrim(administrator.cms_user_id)) > 0
        ) recipient
        where rule.event_type = v_event_type and rule.enabled
        on conflict (
            event_id, rule_key, recipient_cms_user_id, channel
        ) do nothing;
    end loop;
    return new;
end;
$$;

drop trigger if exists commerce_capture_notification_audit_event on commerce.audit_events;
create trigger commerce_capture_notification_audit_event
after insert on commerce.audit_events
for each row execute function commerce.capture_notification_audit_event();

create or replace function commerce.capture_financial_exception_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    v_event_id bigint;
begin
    if new.order_id is null
       or new.status not in ('open', 'investigating')
       or new.severity not in ('high', 'critical')
       or coalesce((
           select configuration.mode
           from commerce.notification_configuration configuration
           where configuration.id = 'default'
       ), 'builtin') = 'disabled'
       or (tg_op = 'UPDATE'
           and old.status in ('open', 'investigating')
           and old.severity in ('high', 'critical')) then
        return new;
    end if;

    insert into commerce.notification_events (
        event_key, contract_version, event_type, aggregate_type,
        aggregate_id, aggregate_version, occurred_at, payload
    ) values (
        'commerce.admin.financial_exception:' || new.id,
        1,
        'commerce.admin.financial_exception',
        'order',
        new.order_id::text,
        new.id,
        new.detected_at,
        jsonb_build_object(
            'financialException', jsonb_build_object(
                'id', new.id,
                'kind', new.kind,
                'severity', new.severity,
                'status', new.status,
                'reason', new.reason,
                'details', new.details
            )
        )
    )
    on conflict (event_key) do nothing
    returning id into v_event_id;
    if v_event_id is null then
        return new;
    end if;

    insert into commerce.notification_deliveries (
        event_id, rule_key, recipient_cms_user_id, recipient_role
    )
    select
        v_event_id,
        rule.key,
        administrator.cms_user_id,
        'admin'
    from commerce.notification_rules rule
    join commerce.notification_configuration configuration on configuration.id = 'default'
    cross join lateral unnest(configuration.admin_recipient_cms_user_ids)
        administrator(cms_user_id)
    where rule.event_type = 'commerce.admin.financial_exception'
      and rule.enabled
      and length(btrim(administrator.cms_user_id)) > 0
    on conflict (
        event_id, rule_key, recipient_cms_user_id, channel
    ) do nothing;
    return new;
end;
$$;

drop trigger if exists commerce_capture_financial_exception_notification
    on commerce.financial_exceptions;
create trigger commerce_capture_financial_exception_notification
after insert or update of status, severity on commerce.financial_exceptions
for each row execute function commerce.capture_financial_exception_notification();
