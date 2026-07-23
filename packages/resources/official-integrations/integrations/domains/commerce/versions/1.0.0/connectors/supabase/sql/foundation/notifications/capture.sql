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
        else null
    end;
    if v_event_type is not null then
        v_event_types := array_append(v_event_types, v_event_type);
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
            when v_event_type = 'commerce.order.refunded'
                then v_event_type || ':' || new.aggregate_id
            else v_event_type || ':' || new.order_id
        end;
        insert into commerce.notification_events (
            event_key, contract_version, event_type, aggregate_type,
            aggregate_id, aggregate_version, occurred_at, payload
        ) values (
            v_event_key, 1, v_event_type, 'order', new.order_id::text,
            new.id, new.created_at,
            jsonb_build_object(
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

        insert into commerce.notification_deliveries (
            event_id, rule_key, recipient_cms_user_id
        )
        select v_event_id, rule.key, v_order.buyer_cms_user_id
        from commerce.notification_rules rule
        where rule.event_type = v_event_type and rule.enabled
        on conflict (event_id, rule_key, recipient_cms_user_id, channel) do nothing;
    end loop;
    return new;
end;
$$;

drop trigger if exists commerce_capture_notification_audit_event on commerce.audit_events;
create trigger commerce_capture_notification_audit_event
after insert on commerce.audit_events
for each row execute function commerce.capture_notification_audit_event();
