\set ON_ERROR_STOP on
begin;
set local role service_role;

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id,
    recipient_name, recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-cancellation-smoke', 'order-cancellation-smoke', 'order-cancellation-smoke',
    '12345678', 'label_ready', 'seller-cancellation-smoke', 'Buyer', '1 rue', '75001', 'Paris',
    'FR', 500, 12345, 'EUR'
);

select delivery.issue_label_access_token(
    'order-cancellation-smoke', 'seller-cancellation-smoke', repeat('a', 64),
    now() + interval '10 minutes'
);

do $$
begin
    begin
        perform delivery.issue_label_access_token(
            'order-cancellation-smoke', 'unrelated-seller', repeat('b', 64),
            now() + interval '10 minutes'
        );
        raise exception 'delivery cancellation smoke: unrelated seller minted a label token';
    exception when others then
        if sqlerrm not like 'not_found: shipment%' then raise; end if;
    end;
end;
$$;

select delivery.cancel_shipment_unscanned(
    'order-cancellation-smoke', now() + interval '48 hours'
);

do $$
declare v_deadline timestamptz;
begin
    if (select status from delivery.shipments where id = 'shipment-cancellation-smoke')
        <> 'cancelled_unscanned'
        or (select cancellation_tracking_until from delivery.shipments
            where id = 'shipment-cancellation-smoke') is null
        or (select revoked_at from delivery.label_access_tokens where token_hash = repeat('a', 64)) is null then
        raise exception 'delivery cancellation smoke: cancellation and token revocation were not atomic';
    end if;
    select cancellation_tracking_until into v_deadline
    from delivery.shipments where id = 'shipment-cancellation-smoke';
    if (delivery.cancel_shipment_unscanned(
        'order-cancellation-smoke', v_deadline
    )->>'idempotentReplay')::boolean is not true then
        raise exception 'delivery cancellation smoke: replay was not idempotent';
    end if;
end;
$$;

update delivery.shipments
set status = 'cancelled', cancellation_tracking_until = now() - interval '1 minute'
where id = 'shipment-cancellation-smoke';

do $$
declare
    v_deadline timestamptz;
    v_replay jsonb;
begin
    select cancellation_tracking_until into v_deadline
    from delivery.shipments where id = 'shipment-cancellation-smoke';
    v_replay := delivery.cancel_shipment_unscanned('order-cancellation-smoke', v_deadline);
    if v_replay->>'status' <> 'cancelled'
        or (v_replay->>'idempotentReplay')::boolean is not true then
        raise exception 'delivery cancellation smoke: expired terminal cancellation did not replay';
    end if;
    begin
        perform delivery.cancel_shipment_unscanned(
            'order-cancellation-smoke', v_deadline + interval '1 hour'
        );
        raise exception 'delivery cancellation smoke: changed replay deadline was accepted';
    exception when others then
        if sqlerrm not like 'conflict: cancellation replay changed the tracking deadline%' then raise; end if;
    end;
end;
$$;

update delivery.shipments
set status = 'cancelled_unscanned', cancellation_tracking_until = now() + interval '48 hours'
where id = 'shipment-cancellation-smoke';

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id, tracking_checked_at, recipient_name,
    recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-order-health-smoke', '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001', '44332211', 'collected_by_recipient',
    'seller-order-health-smoke', now(), 'Buyer', '1 rue', '75001', 'Paris',
    'FR', 500, 12345, 'EUR'
);

do $$
declare
    v_health jsonb;
    v_order jsonb;
begin
    v_health := delivery.get_projection_health();
    select item into v_order
    from jsonb_array_elements(v_health->'orders') item
    where item->>'externalOrderId' = '00000000-0000-4000-8000-000000000001';
    if v_order is null
        or v_order->>'shipmentId' <> 'shipment-order-health-smoke'
        or v_order->>'providerReference' <> '44332211'
        or v_order->>'shipmentStatus' <> 'collected_by_recipient'
        or (v_order->>'pendingProjectionCount')::integer <> 0
        or (v_order->>'manualReviewCount')::integer <> 0
        or (v_order->>'trackingErrorCount')::integer <> 0
        or v_order->>'trackingCheckedAt' is null then
        raise exception 'delivery cancellation smoke: per-order health snapshot is incomplete';
    end if;
end;
$$;

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id, tracking_claimed_at, tracking_claimed_by,
    recipient_name, recipient_address_line1, recipient_postal_code, recipient_city,
    recipient_country, weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-active-scan-smoke', 'order-active-scan-smoke', 'order-active-scan-smoke',
    '87654321', 'label_ready', 'seller-active-scan', now(), 'active-scan-worker',
    'Buyer', '1 rue', '75001', 'Paris', 'FR', 500, 12345, 'EUR'
);

do $$
begin
    begin
        perform delivery.cancel_shipment_unscanned(
            'order-active-scan-smoke', now() + interval '48 hours'
        );
        raise exception 'delivery cancellation smoke: active tracking lease lost the cancellation race';
    exception when others then
        if sqlerrm not like 'conflict: active carrier reconciliation prevents cancellation%' then raise; end if;
    end;
    if (select status from delivery.shipments where id = 'shipment-active-scan-smoke') <> 'label_ready' then
        raise exception 'delivery cancellation smoke: active scan shipment was cancelled';
    end if;
end;
$$;

do $$
declare v_claimed delivery.shipments%rowtype;
begin
    select * into v_claimed from delivery.claim_due_shipments('cancellation-tracker', 1);
    if v_claimed.id <> 'shipment-cancellation-smoke'
        or v_claimed.status <> 'cancelled_unscanned' then
        raise exception 'delivery cancellation smoke: cancelled label was no longer tracked';
    end if;
end;
$$;

insert into delivery.shipment_events (
    shipment_id, order_public_id, expedition_number, event_label,
    provider_event_key, normalized_status, occurred_at
) values (
    'shipment-cancellation-smoke', 'order-cancellation-smoke', '12345678',
    'Late carrier scan', 'late-carrier-scan-smoke', 'carrier_accepted', now()
);

do $$
declare v_health jsonb;
begin
    v_health := delivery.get_projection_health();
    if (v_health->>'pendingProjectionCount')::integer <> 1 then
        raise exception 'delivery cancellation smoke: pending projection was absent from health';
    end if;
    update delivery.shipment_events set
        projection_status = 'manual_review', projection_manual_review_at = now()
    where provider_event_key = 'late-carrier-scan-smoke';
    v_health := delivery.get_projection_health();
    if (v_health->>'manualReviewCount')::integer < 1 then
        raise exception 'delivery cancellation smoke: manual review was absent from health';
    end if;
    perform delivery.review_shipment_event_projection(
        (select id from delivery.shipment_events where provider_event_key = 'late-carrier-scan-smoke'),
        'requeue', 'support-delivery-smoke', 'Commerce projection is ready for a safe retry'
    );
    if (select projection_status from delivery.shipment_events
        where provider_event_key = 'late-carrier-scan-smoke') <> 'retry_wait'
        or not exists (
            select 1 from delivery.projection_review_actions action
            join delivery.shipment_events event on event.id = action.shipment_event_id
            where event.provider_event_key = 'late-carrier-scan-smoke'
              and action.actor_cms_user_id = 'support-delivery-smoke'
              and action.action = 'requeue'
        ) then
        raise exception 'delivery cancellation smoke: operator requeue was not audited';
    end if;
end;
$$;

insert into delivery.shipments (
    id, external_order_id, idempotency_key, expedition_number, status,
    seller_cms_user_id, recipient_name, recipient_address_line1,
    recipient_postal_code, recipient_city, recipient_country,
    weight_grams, declared_value_minor_amount, declared_currency
) values (
    'shipment-ordering-smoke', 'order-ordering-smoke', 'order-ordering-smoke',
    '11223344', 'in_transit', 'seller-ordering-smoke', 'Buyer', '1 rue',
    '75001', 'Paris', 'FR', 500, 12345, 'EUR'
);

insert into delivery.shipment_events (
    shipment_id, order_public_id, expedition_number, event_label,
    provider_event_key, normalized_status, occurred_at, created_at
) values
    ('shipment-ordering-smoke', 'order-ordering-smoke', '11223344', 'Newest event',
        'ordering-newest', 'available_for_pickup', now() - interval '1 hour', now()),
    ('shipment-ordering-smoke', 'order-ordering-smoke', '11223344', 'Oldest event',
        'ordering-oldest', 'carrier_accepted', now() - interval '3 hours', now() + interval '1 second');

do $$
declare
    v_claim jsonb;
    v_ordering_claims integer := 0;
begin
    for v_claim in select * from delivery.claim_pending_shipment_events(
        'ordering-worker', 24, 300, 5
    ) loop
        if v_claim->>'shipment_id' = 'shipment-ordering-smoke' then
            v_ordering_claims := v_ordering_claims + 1;
            if v_claim->>'provider_event_key' <> 'ordering-oldest' then
                raise exception 'delivery cancellation smoke: newest event was claimed before its predecessor';
            end if;
        end if;
    end loop;
    if v_ordering_claims <> 1 then
        raise exception 'delivery cancellation smoke: more than one event was in flight for one shipment';
    end if;
end;
$$;

rollback;
