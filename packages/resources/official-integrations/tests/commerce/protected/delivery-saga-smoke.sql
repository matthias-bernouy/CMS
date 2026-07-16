\set ON_ERROR_STOP on
begin;
set local role service_role;

select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Delivery saga smoke policy', 'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50, 'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50, 'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500, 'sellerFeeRateBps', 500,
        'sellerReserveRateBps', 1000, 'payoutDelayDays', 14,
        'highValueReviewAmount', 500000, 'claimRatioReviewBps', 10000
    ), 'delivery-saga-smoke',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by
) values (
    'user', 'delivery-saga-seller', 'delivery-saga-seller', 'Delivery saga seller',
    'verified', now(), 'delivery-saga-smoke'
) returning id as seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'delivery-partial-buyer', 'delivery-saga-partial-checkout',
    left(encode(extensions.digest('delivery-saga-partial-checkout', 'sha256'), 'hex'), 32)
) returning id as partial_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'DELIVERY-SAGA-PARTIAL', :'partial_checkout_group_id', :'seller_id',
    'delivery-partial-buyer', 'eur', 10000, 10000,
    'delivery-saga-partial-checkout',
    left(encode(extensions.digest('delivery-saga-partial-checkout', 'sha256'), 'hex'), 32)
) returning public_id as partial_order_public_id \gset

do $$
declare
    v_order commerce.orders%rowtype;
    v_authorization jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'DELIVERY-SAGA-PARTIAL';
    v_authorization := commerce.get_order_fulfillment_authorization(v_order.public_id);
    if jsonb_typeof(v_authorization->'allowed') <> 'boolean'
        or (v_authorization->>'allowed')::boolean is not false
        or v_authorization->>'reason' <> 'financial_terms_missing' then
        raise exception 'delivery saga smoke: partial order authorization did not fail closed as boolean false';
    end if;
end;
$$;

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'delivery-saga-buyer', 'delivery-saga-checkout-1',
    left(encode(extensions.digest('delivery-saga-checkout-1', 'sha256'), 'hex'), 32)
) returning id as checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'DELIVERY-SAGA-1', :'checkout_group_id', :'seller_id', 'delivery-saga-buyer',
    'eur', 10000, 10000, 'delivery-saga-checkout-1',
    left(encode(extensions.digest('delivery-saga-checkout-1', 'sha256'), 'hex'), 32)
) returning id as order_id, public_id as order_public_id, version as order_version \gset

select result->>'financial_terms_hash' as terms_hash,
    (result->>'buyer_total_amount')::bigint as buyer_total
from (select commerce.lock_order_financial_terms(
    :'order_public_id', 'delivery-saga-buyer', 'delivery-saga-quote-1', 1200, 'eur',
    :order_version, 'delivery-saga-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'order_public_id', 'delivery-saga-payment-1', 9101, 'succeeded',
    :buyer_total, 'eur', :'terms_hash', now(), '{}',
    'ch_delivery_saga_1', 'pi_delivery_saga_1'
);

select result->>'operationId' as creation_operation_id,
    result->>'claimToken' as initial_creation_claim
from (select commerce.reserve_order_shipment_creation(
    :'order_public_id', 'delivery-saga-seller', 'seller-request'
) result) reserved \gset

do $$
begin
    if (select fulfillment.status from commerce.order_fulfillments fulfillment
            join commerce.orders order_row on order_row.id = fulfillment.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'shipment_creating'
        or (select operation.status from commerce.shipment_creation_operations operation
            join commerce.orders order_row on order_row.id = operation.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'processing' then
        raise exception 'delivery saga smoke: creation was not durably reserved';
    end if;
end;
$$;

-- Simulate a process crash after the provider call began but before Commerce was completed.
update commerce.shipment_creation_operations
set claimed_at = now() - interval '6 minutes'
where id = :'creation_operation_id';

select item->>'claimToken' as recovered_creation_claim,
    (item->>'operationId')::bigint as recovered_creation_operation_id
from commerce.claim_pending_shipment_creations('delivery-saga-recovery', 5) as claimed(item)
where (item->>'operationId')::bigint = :'creation_operation_id' \gset

do $$
begin
    if (select attempts from commerce.shipment_creation_operations operation
        join commerce.orders order_row on order_row.id = operation.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1') <> 2
        or (select claimed_by from commerce.shipment_creation_operations operation
        join commerce.orders order_row on order_row.id = operation.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1') <> 'delivery-saga-recovery' then
        raise exception 'delivery saga smoke: expired creation lease was not safely reclaimed';
    end if;
end;
$$;

select commerce.fail_order_shipment_creation(
    :'creation_operation_id', :'recovered_creation_claim',
    'provider response was lost after shipment creation', true
);

select commerce.recover_order_shipment_creation(
    :'order_public_id', '12345678', 'delivery-shipment-1',
    '{"status":"label_ready","idempotentReplay":true}'::jsonb,
    'support', 'delivery-saga-support',
    'Matched the exact provider shipment after an ambiguous response'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_replay jsonb;
    v_recovery_replay jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'DELIVERY-SAGA-1';
    v_replay := commerce.reserve_order_shipment_creation(
        v_order.public_id, 'delivery-saga-seller', 'seller-replay'
    );
    if (v_replay->>'idempotentReplay')::boolean is not true
        or v_replay->>'deliveryQuoteId' <> 'delivery-saga-quote-1'
        or v_replay->>'buyerCmsUserId' <> 'delivery-saga-buyer'
        or nullif(v_replay->>'claimToken', '') is null then
        raise exception 'delivery saga smoke: completed creation replay lost its authorization payload';
    end if;
    if (select settlement.status from commerce.order_settlements settlement
        where settlement.order_id = v_order.id) <> 'held' then
        raise exception 'delivery saga smoke: audited shipment recovery did not restore the held settlement';
    end if;
    v_recovery_replay := commerce.recover_order_shipment_creation(
        v_order.public_id, '12345678', 'delivery-shipment-1',
        '{"status":"label_ready"}'::jsonb, 'support', 'delivery-saga-support',
        'Retry after the audited recovery response was lost'
    );
    if (v_recovery_replay->>'idempotentReplay')::boolean is not true then
        raise exception 'delivery saga smoke: shipment recovery replay was not idempotent';
    end if;
    if (commerce.get_order_label_authorization(
        v_order.public_id, 'delivery-saga-seller'
    )->>'allowed')::boolean is not true then
        raise exception 'delivery saga smoke: completed creation did not authorize the seller label';
    end if;
end;
$$;

select result->>'id' as cancellation_request_id
from (select commerce.request_order_cancellation(
    :'order_id', 'seller', 'delivery-saga-seller', 'item unavailable'
) result) cancellation \gset

do $$
begin
    if exists (select 1 from commerce.refund_requests request
        join commerce.orders order_row on order_row.id = request.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1') then
        raise exception 'delivery saga smoke: refund was created before Delivery cancellation';
    end if;
    if (select request.status from commerce.order_cancellation_requests request
        join commerce.orders order_row on order_row.id = request.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1')
        <> 'provider_cancellation_pending' then
        raise exception 'delivery saga smoke: cancellation did not wait for Delivery';
    end if;
end;
$$;

select item->>'claimToken' as cancellation_claim,
    (item->>'operationId')::bigint as cancellation_operation_id
from commerce.claim_pending_shipment_cancellations('delivery-cancellation-worker', 5) as claimed(item)
where (item->>'cancellationRequestId')::bigint = :'cancellation_request_id' \gset

do $$
declare
    v_operation commerce.shipment_cancellation_operations%rowtype;
begin
    select operation.* into v_operation
    from commerce.shipment_cancellation_operations operation
    join commerce.orders order_row on order_row.id = operation.order_id
    where order_row.order_number = 'DELIVERY-SAGA-1';
    begin
        perform commerce.complete_order_shipment_cancellation(
            v_operation.id, v_operation.claim_token, null,
            '12345678', '{"status":null}'::jsonb
        );
        if exists (select 1 from commerce.refund_requests request
            where request.order_id = v_operation.order_id) then
            raise exception 'null provider status created a refund';
        end if;
        raise exception 'rollback-null-provider-probe';
    exception when others then
        if sqlerrm <> 'rollback-null-provider-probe' then raise; end if;
    end;
    begin
        perform commerce.complete_order_shipment_cancellation(
            v_operation.id, v_operation.claim_token, '',
            '12345678', '{"status":""}'::jsonb
        );
        if exists (select 1 from commerce.refund_requests request
            where request.order_id = v_operation.order_id) then
            raise exception 'blank provider status created a refund';
        end if;
        raise exception 'rollback-blank-provider-probe';
    exception when others then
        if sqlerrm <> 'rollback-blank-provider-probe' then raise; end if;
    end;
end;
$$;

select commerce.complete_order_shipment_cancellation(
    :'cancellation_operation_id', :'cancellation_claim', 'cancelled_unscanned',
    '12345678', '{"status":"cancelled_unscanned"}'::jsonb
);

do $$
begin
    if exists (select 1 from commerce.refund_requests request
        join commerce.orders order_row on order_row.id = request.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1')
        or (select fulfillment.status from commerce.order_fulfillments fulfillment
            join commerce.orders order_row on order_row.id = fulfillment.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'label_created'
        or (select operation.status from commerce.shipment_cancellation_operations operation
            join commerce.orders order_row on order_row.id = operation.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'requested'
        or (select operation.attempts from commerce.shipment_cancellation_operations operation
            join commerce.orders order_row on order_row.id = operation.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 0
        or (select request.status from commerce.order_cancellation_requests request
            join commerce.orders order_row on order_row.id = request.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'provider_cancellation_pending' then
        raise exception 'delivery saga smoke: local unscanned cancellation released money before terminal confirmation';
    end if;
end;
$$;

update commerce.shipment_cancellation_operations operation set available_at = now()
from commerce.orders order_row
where order_row.id = operation.order_id and order_row.order_number = 'DELIVERY-SAGA-1';

select item->>'claimToken' as terminal_cancellation_claim
from commerce.claim_pending_shipment_cancellations('delivery-cancellation-terminal-worker', 5) as claimed(item)
where (item->>'operationId')::bigint = :'cancellation_operation_id' \gset

select commerce.complete_order_shipment_cancellation(
    :'cancellation_operation_id', :'terminal_cancellation_claim', 'cancelled',
    '12345678', '{"status":"cancelled"}'::jsonb
);

do $$
begin
    if not exists (select 1 from commerce.refund_requests request
        join commerce.orders order_row on order_row.id = request.order_id
        where order_row.order_number = 'DELIVERY-SAGA-1')
        or (select fulfillment.status from commerce.order_fulfillments fulfillment
            join commerce.orders order_row on order_row.id = fulfillment.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'cancelled' then
        raise exception 'delivery saga smoke: terminal Delivery cancellation did not create the refund';
    end if;
end;
$$;

select commerce.record_order_fulfillment_projection(
    :'order_public_id', 'delivery-saga-late-scan', 'carrier_accepted', now(),
    '12345678', null, now(), null
);

do $$
begin
    if (select fulfillment.status from commerce.order_fulfillments fulfillment
            join commerce.orders order_row on order_row.id = fulfillment.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'manual_review'
        or (select settlement.status from commerce.order_settlements settlement
            join commerce.orders order_row on order_row.id = settlement.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1') <> 'manual_review'
        or not exists (
            select 1 from commerce.financial_exceptions exception_row
            join commerce.orders order_row on order_row.id = exception_row.order_id
            where order_row.order_number = 'DELIVERY-SAGA-1'
              and exception_row.deduplication_key = 'late-carrier-scan:delivery-saga-late-scan'
        ) then
        raise exception 'delivery saga smoke: late scan did not fail closed into manual review';
    end if;
end;
$$;

-- A second order isolates the global Delivery health gates on settlement release.
insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'delivery-health-buyer', 'delivery-saga-checkout-2',
    left(encode(extensions.digest('delivery-saga-checkout-2', 'sha256'), 'hex'), 32)
) returning id as health_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'DELIVERY-SAGA-2', :'health_checkout_group_id', :'seller_id', 'delivery-health-buyer',
    'eur', 10000, 10000, 'delivery-saga-checkout-2',
    left(encode(extensions.digest('delivery-saga-checkout-2', 'sha256'), 'hex'), 32)
) returning id as health_order_id, public_id as health_order_public_id,
    version as health_order_version \gset

select result->>'financial_terms_hash' as health_terms_hash,
    (result->>'buyer_total_amount')::bigint as health_buyer_total
from (select commerce.lock_order_financial_terms(
    :'health_order_public_id', 'delivery-health-buyer', 'delivery-saga-quote-2', 1200, 'eur',
    :health_order_version, 'delivery-saga-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'health_order_public_id', 'delivery-saga-payment-2', 9102, 'succeeded',
    :health_buyer_total, 'eur', :'health_terms_hash', now(), '{}',
    'ch_delivery_saga_2', 'pi_delivery_saga_2'
);

update commerce.order_fulfillments set
    status = 'collected_by_recipient', provider_reference = '87654321',
    carrier_accepted_at = now() - interval '3 days',
    recipient_handoff_at = now() - interval '3 days',
    recipient_handoff_first_observed_at = now() - interval '3 days',
    claim_window_started_at = now() - interval '3 days',
    claim_by_at = now() - interval '1 day', release_eligible_at = now() - interval '1 day',
    blocking_reason = null
where order_id = :'health_order_id';

select version as health_settlement_version
from commerce.order_settlements where order_id = :'health_order_id' \gset

select commerce.record_delivery_reconciliation_health(
    'delivery-stale-heartbeat', now() - interval '31 minutes', 0, 0, 0
);
select commerce.record_delivery_order_reconciliation_health(
    'delivery-order-clean', now(), :'health_order_public_id',
    'delivery-health-shipment', '87654321', 'collected_by_recipient',
    0, 0, 0, now()
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'DELIVERY-SAGA-2';
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    begin
        perform commerce.authorize_order_release(
            v_order.id, 'system', 'delivery-saga-smoke',
            'stale heartbeat must block', v_settlement.version
        );
        raise exception 'delivery saga smoke: stale Delivery heartbeat authorized release';
    exception when others then
        if sqlerrm not like 'conflict: fresh Delivery reconciliation heartbeat is required%' then raise; end if;
    end;
end;
$$;

select commerce.record_delivery_reconciliation_health(
    'delivery-unhealthy', now(), 1, 0, 0
);
select commerce.record_delivery_reconciliation_health(
    'delivery-older-healthy', now() - interval '5 minutes', 0, 0, 0
);
select commerce.record_delivery_order_reconciliation_health(
    'delivery-unrelated-poison', now(), :'order_public_id',
    'delivery-shipment-1', '12345678', 'manual_review',
    0, 1, 0, now()
);
select commerce.record_delivery_order_reconciliation_health(
    'delivery-target-poison', now(), :'health_order_public_id',
    'delivery-health-shipment', '87654321', 'collected_by_recipient',
    1, 0, 0, now()
);
select commerce.record_delivery_order_reconciliation_health(
    'delivery-target-older-clean', now() - interval '5 minutes', :'health_order_public_id',
    'delivery-health-shipment', '87654321', 'collected_by_recipient',
    0, 0, 0, now() - interval '5 minutes'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'DELIVERY-SAGA-2';
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    if (select pending_projection_count from commerce.delivery_reconciliation_health where id = 'mondial-relay') <> 1 then
        raise exception 'delivery saga smoke: older healthy sample overwrote a newer unhealthy sample';
    end if;
    if (select pending_projection_count from commerce.delivery_order_reconciliation_health
        where order_id = v_order.id) <> 1 then
        raise exception 'delivery saga smoke: older per-order sample overwrote a newer poison sample';
    end if;
    begin
        perform commerce.authorize_order_release(
            v_order.id, 'system', 'delivery-saga-smoke',
            'target projection backlog must block', v_settlement.version
        );
        raise exception 'delivery saga smoke: target Delivery projection backlog authorized release';
    exception when others then
        if sqlerrm not like 'conflict: fresh healthy Delivery reconciliation for this order is required%' then raise; end if;
    end;
end;
$$;

select commerce.record_delivery_order_reconciliation_health(
    'delivery-target-clean', now(), :'health_order_public_id',
    'delivery-health-shipment', '87654321', 'collected_by_recipient',
    0, 0, 0, now()
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_authorization jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'DELIVERY-SAGA-2';
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    v_authorization := commerce.authorize_order_release(
        v_order.id, 'system', 'delivery-saga-smoke',
        'fresh healthy target Delivery projection', v_settlement.version
    );
    if v_authorization->>'status' <> 'authorized' then
        raise exception 'delivery saga smoke: unrelated Delivery poison blocked a healthy target order';
    end if;
end;
$$;

rollback;
