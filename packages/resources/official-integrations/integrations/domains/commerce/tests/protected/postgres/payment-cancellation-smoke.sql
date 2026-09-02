\set ON_ERROR_STOP on

begin;
set local role service_role;

create or replace function pg_temp.seed_payment_cancellation_case(
    p_suffix text,
    p_expired boolean,
    p_reserve_amount bigint default 0
)
returns jsonb
language plpgsql
as $$
declare
    v_product_id bigint;
    v_seller_id bigint;
    v_offer_id bigint;
    v_inventory_revision bigint;
    v_order_id bigint;
    v_public_id uuid;
    v_fee commerce.fee_policies%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
begin
    if p_reserve_amount < 0 or p_reserve_amount > 100 then
        raise exception 'smoke: invalid reserve amount';
    end if;
    select * into v_fee from commerce.fee_policies order by id limit 1;
    select * into v_protection from commerce.protection_policies where status = 'published' order by id limit 1;
    select * into v_risk from commerce.seller_risk_policies where status = 'published' order by id limit 1;
    select id into v_seller_id from commerce.sellers where slug = 'default';
    insert into commerce.products (slug, title, status, visibility)
    values ('payment-cancel-product-' || p_suffix, 'Payment cancellation product', 'active', 'public')
    returning id into v_product_id;
    insert into commerce.offers (
        seller_id, product_id, slug, title, condition_code, publication_status,
        workflow_state, accepted_price_amount, currency, availability, quantity_available
    ) values (
        v_seller_id, v_product_id, 'payment-cancel-offer-' || p_suffix,
        'Payment cancellation offer', 'good', 'active', 'approved', 100, 'eur', 'available', 1
    ) returning id, inventory_revision into v_offer_id, v_inventory_revision;
    insert into commerce.orders (
        order_number, seller_id, buyer_cms_user_id, status, currency,
        subtotal_amount, total_amount, idempotency_key, request_hash
    ) values (
        'CO-PAYMENT-CANCEL-' || upper(p_suffix), v_seller_id, 'payment-cancel-buyer-' || p_suffix,
        'awaiting_payment', 'eur', 100, 100, 'payment-cancel-' || p_suffix,
        md5('payment-cancel-' || p_suffix)
    ) returning id, public_id into v_order_id, v_public_id;
    insert into commerce.order_lines (
        order_id, seller_id, offer_id, product_id, title, quantity,
        inventory_reserved, availability_before, inventory_revision_before,
        unit_amount, total_amount, product_snapshot, offer_snapshot, seller_snapshot
    ) values (
        v_order_id, v_seller_id, v_offer_id, v_product_id, 'Payment cancellation offer', 1,
        1, 'available', v_inventory_revision, 100, 100, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
    update commerce.offers set quantity_available = 0, availability = 'unavailable' where id = v_offer_id;
    insert into commerce.order_financial_terms (
        order_id, fee_policy_id, fee_policy_version, fee_policy_snapshot,
        protection_policy_id, protection_policy_version, protection_policy_snapshot,
        seller_risk_policy_id, seller_risk_policy_version, seller_risk_policy_snapshot,
        delivery_quote_id, merchandise_subtotal_amount, shipping_amount,
        buyer_protection_fee_amount, seller_commission_amount,
        platform_shipping_share_amount, seller_shipping_share_amount,
        buyer_total_amount, seller_proceeds_amount, seller_transfer_release_amount,
        seller_reserve_liability_amount, platform_retained_amount,
        estimated_stripe_cost_amount, estimated_carrier_cost_amount,
        platform_risk_reserve_contribution_amount, configured_minimum_margin_amount,
        expected_platform_margin_amount, currency, financial_terms_hash,
        pricing_locked_at, pay_by_at
    ) values (
        v_order_id, v_fee.id, v_fee.version, to_jsonb(v_fee),
        v_protection.id, v_protection.version, to_jsonb(v_protection),
        v_risk.id, v_risk.version, to_jsonb(v_risk),
        'quote-' || p_suffix, 100, 0, 10, 0, 0, 0,
        110, 100, 100 - p_reserve_amount, p_reserve_amount, 10, 0, 0, 0, 0, 10,
        'eur', repeat(substr(p_suffix, 1, 1), 64),
        case when p_expired then now() - interval '2 hours' else now() end,
        case when p_expired then now() - interval '1 hour' else now() + interval '30 minutes' end
    );
    insert into commerce.order_fulfillments (
        order_id, seller_handoff_deadline, scan_grace_deadline
    ) values (v_order_id, now() + interval '1 day', now() + interval '2 days');
    insert into commerce.order_settlements (
        order_id, authorized_seller_amount, seller_reserve_liability_remaining_amount,
        platform_gross_remainder_amount
    ) values (v_order_id, 100, p_reserve_amount, 10);
    if p_reserve_amount > 0 then
        perform commerce.record_seller_financial_exposure(
            v_order_id,
            'reserve:' || v_order_id,
            'reserve',
            'held',
            p_reserve_amount,
            0,
            'Versioned seller rolling reserve',
            jsonb_build_object('testCase', p_suffix)
        );
    end if;
    return jsonb_build_object('orderId', v_order_id, 'publicId', v_public_id, 'offerId', v_offer_id);
end;
$$;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
    if not coalesce(p_condition, false) then raise exception 'smoke: %', p_message; end if;
end;
$$;

select seed->>'orderId' late_order_id, seed->>'publicId' late_public_id, seed->>'offerId' late_offer_id
from (select pg_temp.seed_payment_cancellation_case('a', false) seed) seeded \gset

select commerce.record_order_payment_projection(
    :'late_public_id', 'payment:late:failed', 101, 'failed', 110, 'eur', repeat('a', 64), now(),
    '{"status":"requires_payment_method"}'::jsonb, null, 'pi_late_101'
);
select commerce.ensure_payment_cancellation_request(
    :late_order_id, 'cancelled', 'Buyer cancelled during confirmation', 'smoke', null
);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :late_order_id and status = 'cancellation_pending')
    and exists (select 1 from commerce.offers where id = :late_offer_id and quantity_available = 0),
    'failed/reconfirmable PaymentIntent restored inventory before provider cancellation');

select commerce.record_order_payment_projection(
    :'late_public_id', 'payment:late:succeeded', 101, 'succeeded', 110, 'eur', repeat('a', 64), now(),
    '{"status":"succeeded"}'::jsonb, 'ch_late_101', 'pi_late_101'
);
select commerce.record_order_payment_projection(
    :'late_public_id', 'payment:late:succeeded:replay', 101, 'succeeded', 110, 'eur', repeat('a', 64), now(),
    '{"status":"succeeded"}'::jsonb, 'ch_late_101', 'pi_late_101'
);

select pg_temp.assert_true(
    (select status from commerce.orders where id = :late_order_id) <> 'active'
    and (select count(*) from commerce.refund_requests where business_key = 'late-payment-success:' || :late_order_id || ':101') = 1
    and exists (select 1 from commerce.refund_requests
        where business_key = 'late-payment-success:' || :late_order_id || ':101' and status = 'approved')
    and exists (select 1 from commerce.financial_exceptions
        where deduplication_key = 'late-payment-success:' || :late_order_id || ':101'
          and kind = 'late_payment_success' and severity = 'critical'),
    'late success was not quarantined with one automatic full refund');

select id late_refund_id, business_key late_refund_business_key
from commerce.refund_requests
where business_key = 'late-payment-success:' || :late_order_id || ':101'
\gset

select commerce.record_order_settlement_projection(
    :'late_public_id', 'refund:late:succeeded', 'refund', 201, 'succeeded',
    110, 'eur', now(), null, :late_refund_id, :'late_refund_business_key',
    '{"status":"succeeded"}'::jsonb
);
select commerce.record_order_settlement_projection(
    :'late_public_id', 'refund:late:succeeded', 'refund', 201, 'succeeded',
    110, 'eur', now(), null, :late_refund_id, :'late_refund_business_key',
    '{"status":"succeeded"}'::jsonb
);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :late_order_id and status = 'cancelled')
    and exists (select 1 from commerce.order_fulfillments
        where order_id = :late_order_id and status = 'cancelled'
          and blocking_reason = 'order_cancelled_after_full_refund')
    and exists (select 1 from commerce.order_settlements
        where order_id = :late_order_id and status = 'refunded'
          and total_refunded_amount = 110
          and seller_reserve_liability_remaining_amount = 0)
    and exists (select 1 from commerce.payment_cancellation_requests
        where order_id = :late_order_id and status = 'completed')
    and exists (select 1 from commerce.financial_exceptions
        where deduplication_key = 'late-payment-success:' || :late_order_id || ':101'
          and status = 'resolved')
    and exists (select 1 from commerce.offers where id = :late_offer_id and quantity_available = 1),
    'late success refund did not terminalize cancellation, fulfillment, and exception exactly once');

select seed->>'orderId' cancel_order_id, seed->>'publicId' cancel_public_id, seed->>'offerId' cancel_offer_id
from (select pg_temp.seed_payment_cancellation_case('b', false) seed) seeded \gset
select commerce.record_order_payment_projection(
    :'cancel_public_id', 'payment:cancel:created', 102, 'created', 110, 'eur', repeat('b', 64), now(),
    '{"status":"requires_payment_method"}'::jsonb, null, 'pi_cancel_102'
);
select commerce.ensure_payment_cancellation_request(
    :cancel_order_id, 'cancelled', 'Buyer cancelled during create', 'smoke', null
);
select commerce.record_order_payment_projection(
    :'cancel_public_id', 'payment:cancel:confirmed', 102, 'cancelled', 110, 'eur', repeat('b', 64), now(),
    '{"status":"canceled"}'::jsonb, null, 'pi_cancel_102'
);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :cancel_order_id and status = 'cancelled')
    and exists (select 1 from commerce.offers where id = :cancel_offer_id and quantity_available = 1)
    and not exists (select 1 from commerce.refund_requests where order_id = :cancel_order_id),
    'provider-confirmed cancellation did not restore exactly without refund');

select seed->>'orderId' deadline_order_id, seed->>'publicId' deadline_public_id, seed->>'offerId' deadline_offer_id
from (select pg_temp.seed_payment_cancellation_case('c', true) seed) seeded \gset
select commerce.record_order_payment_projection(
    :'deadline_public_id', 'payment:deadline:processing', 103, 'processing', 110, 'eur', repeat('c', 64), now(),
    '{"status":"processing"}'::jsonb, null, 'pi_deadline_103'
);
select commerce.process_due_order_deadlines('payment-cancellation-smoke', 10);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :deadline_order_id and status = 'cancellation_pending')
    and exists (select 1 from commerce.payment_cancellation_requests
        where order_id = :deadline_order_id and target_order_status = 'expired' and status = 'requested')
    and exists (select 1 from commerce.offers where id = :deadline_offer_id and quantity_available = 0),
    'payment deadline did not retain inventory behind durable provider cancellation');

select commerce.record_order_payment_projection(
    :'deadline_public_id', 'payment:deadline:cancelled', 103, 'cancelled', 110, 'eur', repeat('c', 64), now(),
    '{"status":"canceled"}'::jsonb, null, 'pi_deadline_103'
);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :deadline_order_id and status = 'expired')
    and exists (select 1 from commerce.offers where id = :deadline_offer_id and quantity_available = 1),
    'deadline expiration was not finalized by provider canceled truth');

select seed->>'orderId' absent_order_id, seed->>'publicId' absent_public_id, seed->>'offerId' absent_offer_id
from (select pg_temp.seed_payment_cancellation_case('d', false, 20) seed) seeded \gset
select cancellation_result->>'cancellationRequestId' absent_cancellation_request_id
from (select commerce.ensure_payment_cancellation_request(
    :absent_order_id, 'cancelled', 'Buyer cancelled before provider creation', 'smoke', null
) cancellation_result) requested \gset
select now() absent_occurred_at \gset
select commerce.record_absent_order_payment_cancellation(
    :'absent_public_id', 'payment:absent:cancelled', :'absent_cancellation_request_id', :'absent_occurred_at',
    '{"providerPaymentAbsent":true}'::jsonb
);

-- Reproduce the legacy state where a previous deployment marked provider
-- cancellation completed while leaving the commercial and financial state open.
update commerce.orders
set status = 'cancellation_pending'
where id = :absent_order_id;
update commerce.order_fulfillments
set status = 'awaiting_shipment', blocking_reason = null
where order_id = :absent_order_id;
update commerce.order_settlements
set status = 'blocked',
    authorized_seller_amount = 100,
    seller_reserve_liability_remaining_amount = 20,
    platform_gross_remainder_amount = 10,
    manual_review_reason = 'legacy_provider_absent_state'
where order_id = :absent_order_id;
update commerce.seller_financial_exposures
set recovered_amount = 0,
    status = 'held',
    reason = 'Versioned seller rolling reserve'
where order_id = :absent_order_id
  and exposure_key = 'reserve:' || :absent_order_id;
select commerce.refresh_seller_risk_state(
    (select seller_id from commerce.orders where id = :absent_order_id)
);
update commerce.platform_payout_order_liabilities
set lifecycle_status = 'provisional'
where order_id = :absent_order_id;

select replay->>'idempotentReplay' absent_idempotent_replay
from (select commerce.record_absent_order_payment_cancellation(
    :'absent_public_id', 'payment:absent:cancelled', :'absent_cancellation_request_id', :'absent_occurred_at',
    '{"providerPaymentAbsent":true}'::jsonb
) replay) repaired \gset
select settlement.version absent_settlement_version,
       fulfillment.version absent_fulfillment_version
from commerce.order_settlements settlement
join commerce.order_fulfillments fulfillment
  on fulfillment.order_id = settlement.order_id
where settlement.order_id = :absent_order_id
\gset
select replay->>'idempotentReplay' absent_second_idempotent_replay
from (select commerce.record_absent_order_payment_cancellation(
    :'absent_public_id', 'payment:absent:cancelled', :'absent_cancellation_request_id', :'absent_occurred_at',
    '{"providerPaymentAbsent":true}'::jsonb
) replay) repaired \gset

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :absent_order_id and status = 'cancelled')
    and exists (select 1 from commerce.offers where id = :absent_offer_id and quantity_available = 1)
    and not exists (select 1 from commerce.order_payment_attempts where order_id = :absent_order_id)
    and exists (select 1 from commerce.payment_cancellation_requests
        where order_id = :absent_order_id and status = 'completed'
          and provider_snapshot->>'providerPaymentAbsent' = 'true')
    and exists (select 1 from commerce.order_settlements
        where order_id = :absent_order_id and status = 'released'
          and authorized_seller_amount = 0
          and seller_reserve_liability_remaining_amount = 0
          and platform_gross_remainder_amount = 0)
    and exists (select 1 from commerce.seller_financial_exposures
        where order_id = :absent_order_id and exposure_type = 'reserve'
          and status = 'recovered' and recovered_amount = amount)
    and exists (select 1 from commerce.seller_risk_states risk
        join commerce.orders order_row on order_row.seller_id = risk.seller_id
        where order_row.id = :absent_order_id and risk.reserve_liability_amount = 0)
    and exists (select 1 from commerce.platform_payout_order_liabilities
        where order_id = :absent_order_id and lifecycle_status = 'released')
    and :'absent_idempotent_replay' = 'true'
    and :'absent_second_idempotent_replay' = 'true'
    and exists (select 1 from commerce.order_settlements
        where order_id = :absent_order_id and version = :absent_settlement_version)
    and exists (select 1 from commerce.order_fulfillments
        where order_id = :absent_order_id and version = :absent_fulfillment_version),
    'absent provider truth did not terminalize settlement and reserve without inventing a payment attempt');

select seed->>'orderId' refunded_order_id, seed->>'publicId' refunded_public_id,
       seed->>'offerId' refunded_offer_id
from (select pg_temp.seed_payment_cancellation_case('e', false) seed) seeded \gset

select commerce.record_order_payment_projection(
    :'refunded_public_id', 'payment:refunded:succeeded', 104, 'succeeded',
    110, 'eur', repeat('e', 64), now(),
    '{"status":"succeeded"}'::jsonb, 'ch_refunded_104', 'pi_refunded_104'
);
select commerce.request_order_cancellation(
    :refunded_order_id,
    'buyer',
    'payment-cancel-buyer-e',
    'Buyer cancellation fully refunded before the next payment reconciliation'
);
select id refunded_refund_id, business_key refunded_refund_business_key
from commerce.refund_requests
where order_id = :refunded_order_id
\gset

select commerce.record_order_settlement_projection(
    :'refunded_public_id', 'refund:before-late-success:succeeded', 'refund', 202, 'succeeded',
    110, 'eur', now(), null, :refunded_refund_id, :'refunded_refund_business_key',
    '{"status":"succeeded"}'::jsonb
);
update commerce.order_fulfillments
set status = 'awaiting_shipment', blocking_reason = null
where order_id = :refunded_order_id;
insert into commerce.payment_cancellation_requests (
    order_id, business_key, target_order_status, reason, status,
    provider_payment_id, provider_payment_intent_id, provider_snapshot
) values (
    :refunded_order_id, 'payment-cancellation:late-success:' || :refunded_order_id,
    'cancelled', 'Legacy late payment success awaiting an already completed refund',
    'refund_pending', 104, 'pi_refunded_104', '{"status":"succeeded"}'::jsonb
);
insert into commerce.financial_exceptions (
    deduplication_key, order_id, kind, severity, reason, details
) values (
    'late-payment-success:' || :refunded_order_id || ':104',
    :refunded_order_id, 'late_payment_success', 'critical',
    'Legacy late payment success remained open after a full refund',
    '{"testCase":"legacy-refund-pending"}'::jsonb
);
select commerce.record_order_payment_projection(
    :'refunded_public_id', 'payment:refunded:succeeded:reconciled', 104, 'succeeded',
    110, 'eur', repeat('e', 64), now(),
    '{"status":"succeeded"}'::jsonb, 'ch_refunded_104', 'pi_refunded_104'
);
select version refunded_fulfillment_version
from commerce.order_fulfillments
where order_id = :refunded_order_id
\gset
select commerce.record_order_payment_projection(
    :'refunded_public_id', 'payment:refunded:succeeded:reconciled:replay', 104, 'succeeded',
    110, 'eur', repeat('e', 64), now(),
    '{"status":"succeeded"}'::jsonb, 'ch_refunded_104', 'pi_refunded_104'
);

select pg_temp.assert_true(
    exists (select 1 from commerce.orders where id = :refunded_order_id and status = 'cancelled')
    and exists (select 1 from commerce.order_fulfillments
        where order_id = :refunded_order_id and status = 'cancelled'
          and blocking_reason = 'order_cancelled_after_full_refund'
          and version = :refunded_fulfillment_version)
    and exists (select 1 from commerce.order_settlements
        where order_id = :refunded_order_id and status = 'refunded'
          and authorized_seller_amount = 0
          and total_refunded_amount = 110
          and seller_reserve_liability_remaining_amount = 0
          and platform_gross_remainder_amount = 0)
    and (select count(*) from commerce.refund_requests where order_id = :refunded_order_id) = 1
    and (select count(*) from commerce.payment_cancellation_requests
        where order_id = :refunded_order_id and status = 'completed') = 1
    and exists (select 1 from commerce.financial_exceptions
        where deduplication_key = 'late-payment-success:' || :refunded_order_id || ':104'
          and kind = 'late_payment_success' and status = 'resolved')
    and exists (select 1 from commerce.offers
        where id = :refunded_offer_id and quantity_available = 1),
    'post-refund late payment reconciliation reopened cancellation or duplicated compensation');

rollback;
