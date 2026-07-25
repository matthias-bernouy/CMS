\set ON_ERROR_STOP on

begin;
set local role service_role;

insert into commerce.sellers (
    kind,
    cms_user_id,
    slug,
    display_name
) values (
    'user',
    'shipment-creating-cancellation-seller',
    'shipment-creating-cancellation-seller',
    'Shipment creating cancellation seller'
) returning id as shipment_creating_cancellation_seller_id
\gset

insert into commerce.checkout_groups (
    id,
    buyer_cms_user_id,
    idempotency_key,
    request_hash
) values (
    '41000000-0000-4000-8000-000000000001'::uuid,
    'shipment-creating-cancellation-buyer',
    'shipment-creating-cancellation-order',
    md5('shipment-creating-cancellation-order')
);

insert into commerce.orders (
    public_id,
    order_number,
    checkout_group_id,
    seller_id,
    buyer_cms_user_id,
    status,
    currency,
    subtotal_amount,
    total_amount,
    idempotency_key,
    request_hash
) values (
    '42000000-0000-4000-8000-000000000001'::uuid,
    'SHIPMENT-CREATING-CANCELLATION-1',
    '41000000-0000-4000-8000-000000000001'::uuid,
    :shipment_creating_cancellation_seller_id,
    'shipment-creating-cancellation-buyer',
    'active',
    'eur',
    100,
    100,
    'shipment-creating-cancellation-order',
    md5('shipment-creating-cancellation-order')
) returning id as shipment_creating_cancellation_order_id
\gset

insert into commerce.order_fulfillments (
    order_id,
    status,
    payment_confirmed_at,
    seller_handoff_deadline,
    scan_grace_deadline
) values (
    :shipment_creating_cancellation_order_id,
    'shipment_creating',
    now() - interval '4 hours',
    now() - interval '2 hours',
    now() - interval '1 hour'
);

insert into commerce.order_settlements (
    order_id,
    status,
    authorized_seller_amount,
    seller_reserve_liability_remaining_amount,
    platform_gross_remainder_amount
) values (
    :shipment_creating_cancellation_order_id,
    'held',
    100,
    0,
    0
);

insert into commerce.shipment_creation_operations (
    order_id,
    business_key,
    delivery_quote_id,
    financial_terms_hash,
    status,
    attempts,
    provider_reference,
    provider_shipment_id
) values (
    :shipment_creating_cancellation_order_id,
    'shipment-creating-cancellation-operation',
    'shipment-creating-cancellation-quote',
    repeat('a', 64),
    'succeeded',
    1,
    'shipment-creating-cancellation-reference',
    'shipment-creating-cancellation-provider-id'
);

do $contract$
declare
    v_order_id bigint;
    v_first_request jsonb;
    v_request_replay jsonb;
    v_deadline_result jsonb;
    v_claims jsonb;
    v_replay jsonb;
    v_audit_count bigint;
    v_outbox_count bigint;
begin
    select id into v_order_id
    from commerce.orders
    where order_number = 'SHIPMENT-CREATING-CANCELLATION-1';
    v_first_request := commerce.request_order_cancellation(
        v_order_id,
        'buyer',
        'shipment-creating-cancellation-buyer',
        'buyer_cancelled_before_carrier_acceptance'
    );
    v_request_replay := commerce.request_order_cancellation(
        v_order_id,
        'buyer',
        'shipment-creating-cancellation-buyer',
        'buyer_cancelled_before_carrier_acceptance'
    );
    if v_first_request->>'status' <> 'requested'
        or v_request_replay->>'id' <> v_first_request->>'id'
        or (select count(*) from commerce.order_cancellation_requests
            where order_id = v_order_id) <> 1 then
        raise exception 'shipment creating cancellation: buyer request replay was not stable';
    end if;

    v_deadline_result := commerce.process_due_order_deadlines(
        'shipment-creating-cancellation',
        10
    );
    if (v_deadline_result->>'processed')::integer <> 1
        or v_deadline_result->'events'->0->>'kind' <> 'cancellation_scan_grace'
        or v_deadline_result->'events'->0->>'outcome'
            <> 'provider_cancellation_pending' then
        raise exception 'shipment creating cancellation: deadline worker did not enter provider cancellation: %',
            v_deadline_result;
    end if;

    if not exists (
        select 1
        from commerce.order_cancellation_requests request
        join commerce.shipment_cancellation_operations operation
          on operation.order_cancellation_request_id = request.id
        where request.order_id = v_order_id
          and request.status = 'provider_cancellation_pending'
          and operation.status = 'requested'
          and operation.business_key = 'shipment-cancellation:' || request.id
    ) or not exists (
        select 1
        from commerce.orders order_row
        join commerce.order_fulfillments fulfillment
          on fulfillment.order_id = order_row.id
        join commerce.order_settlements settlement
          on settlement.order_id = order_row.id
        where order_row.id = v_order_id
          and order_row.status = 'cancellation_pending'
          and fulfillment.status = 'shipment_creating'
          and fulfillment.blocking_reason is null
          and settlement.status = 'held'
    ) or exists (
        select 1
        from commerce.financial_exceptions exception
        where exception.order_id = v_order_id
          and exception.deduplication_key like 'deadline:%'
    ) then
        raise exception 'shipment creating cancellation: provider cancellation state was not isolated';
    end if;

    select coalesce(jsonb_agg(claim), '[]'::jsonb)
    into v_claims
    from commerce.claim_pending_shipment_cancellations(
        'shipment-creating-cancellation-worker',
        10
    ) claim;
    if jsonb_array_length(v_claims) <> 1
        or v_claims->0->>'providerReference'
            <> 'shipment-creating-cancellation-reference'
        or v_claims->0->>'status' <> 'processing' then
        raise exception 'shipment creating cancellation: provider operation was not claimable: %',
            v_claims;
    end if;

    select coalesce(jsonb_agg(claim), '[]'::jsonb)
    into v_claims
    from commerce.claim_pending_shipment_cancellations(
        'shipment-creating-cancellation-worker-replay',
        10
    ) claim;
    if jsonb_array_length(v_claims) <> 0 then
        raise exception 'shipment creating cancellation: processing operation was claimed twice';
    end if;

    v_request_replay := commerce.request_order_cancellation(
        v_order_id,
        'buyer',
        'shipment-creating-cancellation-buyer',
        'buyer_cancelled_before_carrier_acceptance'
    );
    if v_request_replay->>'status' <> 'provider_cancellation_pending'
        or v_request_replay->>'id' <> v_first_request->>'id' then
        raise exception 'shipment creating cancellation: post-transition replay changed identity';
    end if;

    select count(*) into v_audit_count
    from commerce.audit_events
    where order_id = v_order_id;
    select count(*) into v_outbox_count
    from commerce.outbox_events
    where order_id = v_order_id;

    -- Simulate a stale order-status projection to prove that the active
    -- provider cancellation itself excludes both fulfillment deadlines.
    update commerce.orders
    set status = 'active'
    where id = v_order_id;
    update commerce.order_fulfillments
    set scan_grace_deadline = now() + interval '1 hour'
    where order_id = v_order_id;
    v_replay := commerce.process_due_order_deadlines(
        'shipment-creating-cancellation-handoff-replay',
        10
    );
    if (v_replay->>'processed')::integer <> 0 then
        raise exception 'shipment creating cancellation: seller handoff deadline raced cancellation: %',
            v_replay;
    end if;

    update commerce.order_fulfillments
    set scan_grace_deadline = now() - interval '1 hour'
    where order_id = v_order_id;
    v_replay := commerce.process_due_order_deadlines(
        'shipment-creating-cancellation-scan-replay',
        10
    );
    if (v_replay->>'processed')::integer <> 0
        or exists (
            select 1
            from commerce.order_fulfillments fulfillment
            join commerce.order_settlements settlement
              on settlement.order_id = fulfillment.order_id
            where fulfillment.order_id = v_order_id
              and (
                  fulfillment.status = 'manual_review'
                  or fulfillment.blocking_reason is not null
                  or settlement.status = 'manual_review'
              )
        )
        or (select count(*) from commerce.audit_events
            where order_id = v_order_id) <> v_audit_count
        or (select count(*) from commerce.outbox_events
            where order_id = v_order_id) <> v_outbox_count then
        raise exception 'shipment creating cancellation: scan deadline raced cancellation: %',
            v_replay;
    end if;
end;
$contract$;

rollback;
