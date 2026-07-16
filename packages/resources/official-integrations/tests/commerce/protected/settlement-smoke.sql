\set ON_ERROR_STOP on
begin;
set local role service_role;
select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Protected smoke policy', 'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 50, 'estimatedCarrierCostAmount', 100,
        'platformRiskReserveContributionAmount', 50, 'configuredMinimumMarginAmount', 100,
        'buyerFeeFixedAmount', 500, 'sellerFeeRateBps', 500,
        'sellerReserveRateBps', 1000, 'payoutDelayDays', 14,
        'highValueReviewAmount', 500000, 'claimRatioReviewBps', 10000
    ), 'smoke-admin',
    (select version from commerce.settings where id = 'default')
);

select commerce.record_delivery_reconciliation_health(
    'settlement-smoke', now(), 0, 0, 0
);
insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by
) values (
    'user', 'protected-seller', 'protected-seller', 'Protected seller',
    'verified', now(), 'smoke-admin'
) returning id as seller_id \gset
insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'protected-buyer', 'protected-checkout', left(encode(extensions.digest('protected-checkout', 'sha256'), 'hex'), 32)
) returning id as checkout_group_id \gset
insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PROTECTED-SMOKE-1', :'checkout_group_id', :seller_id, 'protected-buyer',
    'eur', 10000, 10000, 'protected-checkout', left(encode(extensions.digest('protected-checkout', 'sha256'), 'hex'), 32)
) returning id as order_id, public_id as order_public_id, version as order_version \gset

select result->>'financial_terms_hash' as terms_hash,
    (result->>'buyer_total_amount')::bigint as buyer_total,
    (result->>'seller_transfer_release_amount')::bigint as seller_release
from (select commerce.lock_order_financial_terms(
    :'order_public_id', 'protected-buyer', 'quote-smoke-1', 1200, 'eur',
    :order_version, 'delivery-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'order_public_id', 'evt-payment-success', 702, 'succeeded',
    :buyer_total, 'eur', :'terms_hash', now(), '{}', 'ch_smoke', 'pi_smoke'
);

select commerce.record_order_fulfillment_projection(
    :'order_public_id', 'evt-label', 'label_created', now(), 'shipment-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'order_public_id', 'evt-carrier', 'carrier_accepted', now(), 'shipment-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'order_public_id', 'evt-collected', 'collected_by_recipient', now(),
    'shipment-smoke', now() - interval '49 hours'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_after commerce.order_fulfillments%rowtype;
    v_replay jsonb;
    v_stale jsonb;
begin
    select * into v_order from commerce.orders
    where order_number = 'PROTECTED-SMOKE-1';
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id;
    if v_fulfillment.recipient_handoff_at <> now() - interval '49 hours'
        or v_fulfillment.claim_window_started_at
            <> v_fulfillment.recipient_handoff_first_observed_at
        or v_fulfillment.claim_by_at - v_fulfillment.claim_window_started_at
            <> interval '48 hours'
        or v_fulfillment.release_eligible_at <> v_fulfillment.claim_by_at then
        raise exception 'smoke: delayed recipient handoff did not receive a fresh full claim window';
    end if;
    v_replay := commerce.record_order_fulfillment_projection(
        v_order.public_id, 'evt-collected', 'collected_by_recipient', now(),
        'shipment-smoke', now() - interval '49 hours'
    );
    if (v_replay->>'idempotentReplay')::boolean is not true then
        raise exception 'smoke: exact handoff replay was not idempotent';
    end if;
    perform commerce.record_order_fulfillment_projection(
        v_order.public_id, 'evt-collected-older', 'collected_by_recipient',
        now() - interval '1 hour', 'shipment-smoke', now() - interval '72 hours'
    );
    perform commerce.record_order_fulfillment_projection(
        v_order.public_id, 'evt-collected-newer', 'collected_by_recipient',
        now(), 'shipment-smoke', now() - interval '1 hour'
    );
    v_stale := commerce.record_order_fulfillment_projection(
        v_order.public_id, 'evt-carrier-after-terminal-retry', 'carrier_accepted',
        now() - interval '1 hour', 'shipment-smoke', null,
        now() - interval '1 hour', null
    );
    if (v_stale->>'ignoredStaleEvent')::boolean is not true then
        raise exception 'smoke: older carrier retry after terminal delivery was not acknowledged as an audited no-op';
    end if;
    select * into v_after from commerce.order_fulfillments where order_id = v_order.id;
    if v_after.recipient_handoff_at is distinct from v_fulfillment.recipient_handoff_at
        or v_after.recipient_handoff_first_observed_at is distinct from
            v_fulfillment.recipient_handoff_first_observed_at
        or v_after.claim_window_started_at is distinct from v_fulfillment.claim_window_started_at
        or v_after.claim_by_at is distinct from v_fulfillment.claim_by_at
        or v_after.release_eligible_at is distinct from v_fulfillment.release_eligible_at then
        raise exception 'smoke: out-of-order handoff projection moved an immutable claim deadline';
    end if;
end;
$$;

update commerce.order_fulfillments set
    recipient_handoff_first_observed_at = now() - interval '49 hours',
    claim_window_started_at = now() - interval '49 hours',
    claim_by_at = now() - interval '1 minute',
    release_eligible_at = now() - interval '1 minute'
where order_id = :order_id;

select commerce.record_delivery_order_reconciliation_health(
    'settlement-smoke', now(), :'order_public_id',
    'shipment-smoke', 'shipment-smoke', 'collected_by_recipient',
    0, 0, 0, now()
);

select (result->>'releaseAuthorizationId')::uuid as release_authorization_id
from (select commerce.authorize_order_release(
    :order_id, 'system', 'release-smoke', 'claim window elapsed',
    (select version from commerce.order_settlements where order_id = :order_id)
) result) authorized \gset

do $$
declare v_order commerce.orders%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SMOKE-1';
    begin
        perform commerce.open_marketplace_claim(
            v_order.id, v_order.buyer_cms_user_id, 'not_as_described',
            'Release won the claim/release boundary race', null
        );
        raise exception 'smoke: a release-pending settlement accepted a claim';
    exception when others then
        if sqlerrm not like 'conflict:%' then raise; end if;
    end;
end;
$$;

do $$
declare v_batch jsonb;
begin
    v_batch := commerce.authorize_due_order_releases('release-retry-smoke', 25);
    if jsonb_array_length(v_batch->'authorizations') <> 1 then
        raise exception 'smoke: pending release authorization was not reclaimed';
    end if;
    v_batch := commerce.authorize_due_order_releases('release-duplicate-smoke', 25);
    if jsonb_array_length(v_batch->'authorizations') <> 0 then
        raise exception 'smoke: active release lease was claimed twice';
    end if;
end;
$$;

select commerce.record_order_settlement_projection(
    :'order_public_id', 'evt-transfer', 'transfer', 801, 'succeeded',
    :seller_release, 'eur', now(), :'release_authorization_id'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_replay jsonb;
    v_settlement commerce.order_settlements%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SMOKE-1';
    v_replay := commerce.record_order_settlement_projection(
        v_order.public_id, 'evt-transfer-replay', 'transfer', 801, 'succeeded',
        (select seller_transfer_release_amount from commerce.order_financial_terms where order_id = v_order.id),
        'eur', now(), (select id from commerce.settlement_release_authorizations where order_id = v_order.id)
    );
    if (v_replay->>'idempotentOperationReplay')::boolean is not true
        or (select total_transferred_amount from commerce.order_settlements where order_id = v_order.id)
            <> (select seller_transfer_release_amount from commerce.order_financial_terms where order_id = v_order.id) then
        raise exception 'smoke: transfer operation replay moved money twice';
    end if;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    select * into v_terms from commerce.order_financial_terms where order_id = v_settlement.order_id;
    if v_settlement.authorized_seller_amount <> v_terms.seller_proceeds_amount
        or v_settlement.total_transferred_amount + v_settlement.seller_reserve_liability_remaining_amount
            <> v_settlement.authorized_seller_amount
        or v_settlement.seller_reserve_liability_remaining_amount <> v_terms.seller_reserve_liability_amount then
        raise exception 'smoke: non-zero seller reserve does not conserve seller entitlement';
    end if;
end;
$$;

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_refund jsonb;
    v_batch jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    v_refund := commerce.create_refund_request(
        v_order.id, null, 'full-post-transfer-smoke', 'full_post_transfer_refund',
        v_terms.buyer_total_amount, v_terms.buyer_protection_fee_amount,
        v_terms.seller_proceeds_amount, 'system', 'refund-worker-smoke', true
    );
    if v_refund->>'status' <> 'approved' then
        raise exception 'smoke: full post-Transfer refund was not approved';
    end if;
    if (v_refund->>'seller_recovery_amount')::bigint <> v_terms.seller_proceeds_amount
        or (v_refund->>'seller_reserve_offset_amount')::bigint
            <> v_terms.seller_reserve_liability_amount then
        raise exception 'smoke: full post-Transfer refund omitted seller reserve recovery';
    end if;
    v_batch := commerce.pending_order_refund_authorizations('refund-retry-smoke', 25);
    if jsonb_array_length(v_batch->'authorizations') <> 1
        or (v_batch->'authorizations'->0->>'sellerRecoveryAmount')::bigint
            <> v_terms.seller_transfer_release_amount then
        raise exception 'smoke: approved refund authorization was not claimed';
    end if;
    v_batch := commerce.pending_order_refund_authorizations('refund-duplicate-smoke', 25);
    if jsonb_array_length(v_batch->'authorizations') <> 0 then
        raise exception 'smoke: active refund lease was claimed twice';
    end if;
    perform commerce.record_order_settlement_projection(
        v_order.public_id, 'evt-full-reversal-success', 'reversal', 804, 'succeeded',
        v_terms.seller_transfer_release_amount, 'eur', now()
    );
    perform commerce.record_order_settlement_projection(
        v_order.public_id, 'evt-full-refund-success', 'refund', 805, 'succeeded',
        v_terms.buyer_total_amount, 'eur', now(), null,
        (v_refund->>'id')::bigint, v_refund->>'business_key', '{}'
    );
end;
$$;

do $$
declare v_order_id bigint;
begin
    select id into v_order_id from commerce.orders where order_number = 'PROTECTED-SMOKE-1';
    if not exists (
        select 1 from commerce.order_settlements settlement
        join commerce.order_financial_terms terms on terms.order_id = settlement.order_id
        where settlement.order_id = v_order_id
          and settlement.status = 'refunded'
          and settlement.authorized_seller_amount = 0
          and settlement.total_transferred_amount = terms.seller_transfer_release_amount
          and settlement.total_reversed_amount = terms.seller_transfer_release_amount
          and settlement.total_refunded_amount = terms.buyer_total_amount
          and settlement.seller_reserve_liability_remaining_amount = 0
    ) then
        raise exception 'smoke: full post-Transfer refund did not recover release and reserve exactly';
    end if;
    if not exists (select 1 from commerce.audit_events where order_id = v_order_id) then
        raise exception 'smoke: financial audit trail is missing';
    end if;
    if not exists (select 1 from commerce.outbox_events where order_id = v_order_id) then
        raise exception 'smoke: financial outbox is missing';
    end if;
end;
$$;

-- Regression: a split decision made before any Transfer must not mutate the
-- seller entitlement until the provider Refund succeeds. The final decision
-- amount is exact and the reserve offsets the refund only once.
insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'protected-split-buyer', 'protected-split-checkout',
    left(encode(extensions.digest('protected-split-checkout', 'sha256'), 'hex'), 32)
) returning id as split_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PROTECTED-SPLIT-SMOKE-1', :'split_checkout_group_id', :seller_id,
    'protected-split-buyer', 'eur', 10000, 10000,
    'protected-split-checkout',
    left(encode(extensions.digest('protected-split-checkout', 'sha256'), 'hex'), 32)
) returning id as split_order_id, public_id as split_order_public_id,
    version as split_order_version \gset

select result->>'financial_terms_hash' as split_terms_hash,
    (result->>'buyer_total_amount')::bigint as split_buyer_total,
    (result->>'seller_proceeds_amount')::bigint as split_seller_proceeds,
    (result->>'seller_transfer_release_amount')::bigint as split_initial_release,
    (result->>'seller_reserve_liability_amount')::bigint as split_initial_reserve
from (select commerce.lock_order_financial_terms(
    :'split_order_public_id', 'protected-split-buyer', 'quote-split-smoke-1',
    1200, 'eur', :split_order_version, 'delivery-split-smoke'
) result) locked \gset

select (:split_initial_release / 2)::bigint as split_decided_seller_amount,
    (:split_seller_proceeds - (:split_initial_release / 2))::bigint as split_refund_amount
\gset

select commerce.record_order_payment_projection(
    :'split_order_public_id', 'evt-split-payment-success', 703, 'succeeded',
    :split_buyer_total, 'eur', :'split_terms_hash', now(), '{}',
    'ch_split_smoke', 'pi_split_smoke'
);
select commerce.record_order_fulfillment_projection(
    :'split_order_public_id', 'evt-split-label', 'label_created', now(), 'shipment-split-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'split_order_public_id', 'evt-split-carrier', 'carrier_accepted', now(), 'shipment-split-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'split_order_public_id', 'evt-split-collected', 'collected_by_recipient', now(),
    'shipment-split-smoke', now()
);

select (result->>'id')::bigint as split_claim_id,
    (result->>'version')::integer as split_claim_version
from (select commerce.open_marketplace_claim(
    :split_order_id, 'protected-split-buyer', 'not_as_described',
    'Split settlement regression smoke', :split_refund_amount
) result) opened \gset

update commerce.order_fulfillments set
    recipient_handoff_at = now() - interval '48 hours',
    recipient_handoff_first_observed_at = now() - interval '48 hours',
    claim_window_started_at = now() - interval '48 hours',
    claim_by_at = now(),
    release_eligible_at = now()
where order_id = :split_order_id;

select commerce.record_delivery_order_reconciliation_health(
    'settlement-split-smoke', now(), :'split_order_public_id',
    'shipment-split-smoke', 'shipment-split-smoke', 'collected_by_recipient',
    0, 0, 0, now()
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders
    where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    begin
        perform commerce.authorize_order_release(
            v_order.id, 'system', 'claim-race-smoke',
            'Claim won the claim/release boundary race', v_settlement.version
        );
        raise exception 'smoke: an open claim allowed release at the deadline boundary';
    exception when others then
        if sqlerrm not like 'conflict:%' then raise; end if;
    end;
end;
$$;

select commerce.resolve_marketplace_claim(
    :split_claim_id, 'split', :split_refund_amount, :split_decided_seller_amount,
    0, 'Partial value retained by seller', 'admin', 'admin-split-smoke',
    :split_claim_version
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_decided_seller_amount bigint;
    v_authorization jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    v_decided_seller_amount := v_terms.seller_transfer_release_amount / 2;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    select * into v_refund from commerce.refund_requests
    where order_id = v_order.id;
    v_authorization := commerce.refund_authorization_payload(v_refund.id);
    if v_settlement.status <> 'refund_pending'
        or v_refund.status <> 'requested'
        or v_refund.requires_finance_approval is not true
        or v_settlement.authorized_seller_amount <> v_terms.seller_proceeds_amount
        or v_settlement.seller_reserve_liability_remaining_amount
            <> v_terms.seller_reserve_liability_amount then
        raise exception 'smoke: split decision mutated seller entitlement before provider success';
    end if;
    if v_refund.seller_recovery_amount <> v_terms.seller_proceeds_amount - v_decided_seller_amount
        or v_refund.seller_reserve_offset_amount
            <> least(v_refund.seller_recovery_amount, v_terms.seller_reserve_liability_amount)
        or (v_authorization->>'sellerEntitlementReductionAmount')::bigint
            <> v_refund.seller_recovery_amount
        or (v_authorization->>'authorizedSellerAmount')::bigint <> v_decided_seller_amount then
        raise exception 'smoke: split refund did not allocate the exact entitlement and reserve offset';
    end if;
end;
$$;

select id as split_refund_request_id, business_key as split_refund_business_key,
    version as split_refund_version
from commerce.refund_requests where order_id = :split_order_id \gset

select commerce.review_refund_request(
    :split_refund_request_id, 'approved', 'admin-split-review',
    'Split claim financial allocation reviewed', :split_refund_version
);

select commerce.record_order_settlement_projection(
    :'split_order_public_id', 'evt-split-refund-success', 'refund', 802, 'succeeded',
    :split_refund_amount, 'eur', now(), null,
    :split_refund_request_id, :'split_refund_business_key', '{}'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_decided_seller_amount bigint;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_refund from commerce.refund_requests where order_id = v_order.id;
    v_decided_seller_amount := v_terms.seller_transfer_release_amount / 2;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    if v_settlement.status <> 'held'
        or v_settlement.total_refunded_amount >= v_terms.buyer_total_amount
        or v_settlement.authorized_seller_amount <> v_decided_seller_amount
        or v_settlement.seller_reserve_liability_remaining_amount
            <> greatest(0, v_terms.seller_reserve_liability_amount
                - v_refund.seller_reserve_offset_amount)
        or v_order.status <> 'completed' then
        raise exception 'smoke: provider refund did not apply the split entitlement exactly once';
    end if;
    if (select status from commerce.marketplace_claims where order_id = v_order.id)
        <> 'resolved_split' then
        raise exception 'smoke: split claim was not resolved after provider refund success';
    end if;
end;
$$;

update commerce.order_fulfillments set
    recipient_handoff_at = now() - interval '2 minutes',
    recipient_handoff_first_observed_at = now() - interval '2 minutes',
    claim_window_started_at = now() - interval '2 minutes',
    claim_by_at = now() - interval '1 minute',
    release_eligible_at = now() - interval '1 minute'
where order_id = :split_order_id;

select (result->>'releaseAuthorizationId')::uuid as split_release_authorization_id,
    (result->>'amount')::bigint as split_release_amount
from (select commerce.authorize_order_release(
    :split_order_id, 'system', 'split-release-smoke',
    'split refund confirmed and claim window elapsed',
    (select version from commerce.order_settlements where order_id = :split_order_id)
) result) authorized \gset

do $$
declare
    v_order_id bigint;
    v_decided_seller_amount bigint;
    v_authorized_amount bigint;
begin
    select order_row.id, claim.resolution_seller_transfer_amount
    into v_order_id, v_decided_seller_amount
    from commerce.orders order_row
    join commerce.marketplace_claims claim on claim.order_id = order_row.id
    where order_row.order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select authorized_amount into v_authorized_amount
    from commerce.settlement_release_authorizations
    where order_id = v_order_id and release_kind = 'initial';
    if v_authorized_amount <> v_decided_seller_amount then
        raise exception 'smoke: split release authorization differs from the exact claim decision';
    end if;
end;
$$;

select commerce.record_order_settlement_projection(
    :'split_order_public_id', 'evt-split-transfer-success', 'transfer', 803, 'succeeded',
    :split_release_amount, 'eur', now(), :'split_release_authorization_id'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_claim commerce.marketplace_claims%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select * into v_claim from commerce.marketplace_claims where order_id = v_order.id;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    if v_settlement.status <> 'released'
        or v_settlement.total_transferred_amount <> v_claim.resolution_seller_transfer_amount
        or v_settlement.authorized_seller_amount <> v_claim.resolution_seller_transfer_amount
        or v_settlement.seller_reserve_liability_remaining_amount <> 0 then
        raise exception 'smoke: exact split seller amount was not released';
    end if;
end;
$$;

-- A won dispute can require one recovery Transfer after the original seller
-- Transfer was reversed. Funds-withdrawn provider truth remains blocked until
-- Stripe reports reinstatement, and retries must not duplicate the top-up.
select commerce.record_order_stripe_dispute_projection(
    :'split_order_public_id', 'evt-split-dispute-withdrawn', 'dp_split_recovery',
    'won', 'fraudulent', :split_buyer_total, 'eur', now(), now(), null,
    '{"fundsWithdrawn":true}'
);
select commerce.record_order_settlement_projection(
    :'split_order_public_id', 'evt-split-dispute-reversal', 'reversal', 807, 'succeeded',
    :split_release_amount, 'eur', now()
);

do $$
declare v_order_id bigint;
begin
    select id into v_order_id from commerce.orders where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    if (select status from commerce.order_settlements where order_id = v_order_id) <> 'reversed'
        or exists (select 1 from commerce.settlement_release_authorizations
            where order_id = v_order_id and release_kind = 'recovery') then
        raise exception 'smoke: withdrawn dispute funds authorized recovery before reinstatement';
    end if;
end;
$$;

select commerce.record_order_stripe_dispute_projection(
    :'split_order_public_id', 'evt-split-dispute-reinstated', 'dp_split_recovery',
    'won', 'fraudulent', :split_buyer_total, 'eur', now(), now(), null,
    '{"fundsWithdrawn":false}'
);
select commerce.record_order_stripe_dispute_projection(
    :'split_order_public_id', 'evt-split-dispute-reinstated-retry', 'dp_split_recovery',
    'won', 'fraudulent', :split_buyer_total, 'eur', now(), now(), null,
    '{"fundsWithdrawn":false}'
);

select result->'authorizations'->0->>'releaseAuthorizationId' as split_recovery_authorization_id,
    (result->'authorizations'->0->>'amount')::bigint as split_recovery_amount
from (select commerce.authorize_due_order_releases('split-recovery-release-smoke', 25) result) due
\gset

select commerce.record_order_settlement_projection(
    :'split_order_public_id', 'evt-split-recovery-transfer', 'transfer', 808, 'succeeded',
    :split_recovery_amount, 'eur', now(), :'split_recovery_authorization_id'
);
select commerce.record_order_settlement_projection(
    :'split_order_public_id', 'evt-split-recovery-transfer-retry', 'transfer', 808, 'succeeded',
    :split_recovery_amount, 'eur', now(), :'split_recovery_authorization_id'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_claim commerce.marketplace_claims%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-SPLIT-SMOKE-1';
    select * into v_claim from commerce.marketplace_claims where order_id = v_order.id;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    if (select count(*) from commerce.settlement_release_authorizations
        where order_id = v_order.id and release_kind = 'recovery') <> 1
        or v_settlement.status <> 'released'
        or v_settlement.authorized_seller_amount <> v_claim.resolution_seller_transfer_amount
        or v_settlement.total_transferred_amount <> v_claim.resolution_seller_transfer_amount * 2
        or v_settlement.total_reversed_amount <> v_claim.resolution_seller_transfer_amount
        or v_settlement.total_transferred_amount - v_settlement.total_reversed_amount
            <> v_claim.resolution_seller_transfer_amount then
        raise exception 'smoke: dispute recovery release was not exact and idempotent';
    end if;
end;
$$;

-- A future provider handoff is durable evidence, but never an early release
-- signal. It must fail closed into the finance exception queue.
insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'protected-anomaly-buyer', 'protected-anomaly-checkout',
    left(encode(extensions.digest('protected-anomaly-checkout', 'sha256'), 'hex'), 32)
) returning id as anomaly_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PROTECTED-ANOMALY-SMOKE-1', :'anomaly_checkout_group_id', :seller_id,
    'protected-anomaly-buyer', 'eur', 10000, 10000,
    'protected-anomaly-checkout',
    left(encode(extensions.digest('protected-anomaly-checkout', 'sha256'), 'hex'), 32)
) returning id as anomaly_order_id, public_id as anomaly_order_public_id,
    version as anomaly_order_version \gset

select result->>'financial_terms_hash' as anomaly_terms_hash,
    (result->>'buyer_total_amount')::bigint as anomaly_buyer_total
from (select commerce.lock_order_financial_terms(
    :'anomaly_order_public_id', 'protected-anomaly-buyer', 'quote-anomaly-smoke-1',
    1200, 'eur', :anomaly_order_version, 'delivery-anomaly-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'anomaly_order_public_id', 'evt-anomaly-payment-success', 709, 'succeeded',
    :anomaly_buyer_total, 'eur', :'anomaly_terms_hash', now(), '{}',
    'ch_anomaly_smoke', 'pi_anomaly_smoke'
);
select commerce.record_order_fulfillment_projection(
    :'anomaly_order_public_id', 'evt-anomaly-label', 'label_created', now(),
    'shipment-anomaly-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'anomaly_order_public_id', 'evt-anomaly-carrier', 'carrier_accepted', now(),
    'shipment-anomaly-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'anomaly_order_public_id', 'evt-anomaly-collected', 'collected_by_recipient',
    now() + interval '2 hours', 'shipment-anomaly-smoke', now() + interval '2 hours'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_fulfillment commerce.order_fulfillments%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders
    where order_number = 'PROTECTED-ANOMALY-SMOKE-1';
    select * into v_fulfillment from commerce.order_fulfillments
    where order_id = v_order.id;
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    if v_fulfillment.status <> 'manual_review'
        or v_fulfillment.blocking_reason <> 'recipient_handoff_timestamp_anomaly'
        or v_settlement.status <> 'manual_review'
        or v_settlement.manual_review_reason <> 'recipient_handoff_timestamp_anomaly'
        or v_fulfillment.claim_window_started_at < v_fulfillment.recipient_handoff_at
        or not exists (select 1 from commerce.financial_exceptions
            where order_id = v_order.id and kind = 'fulfillment_ambiguity'
              and status = 'open') then
        raise exception 'smoke: anomalous future handoff did not fail closed';
    end if;
end;
$$;

insert into commerce.marketplace_claims (
    order_id, buyer_cms_user_id, seller_id, reason, status, description,
    resolution_outcome, seller_response_by_at, return_ship_by_at,
    return_delivery_status, resolved_by
) values (
    :anomaly_order_id, 'protected-anomaly-buyer', :seller_id,
    'return_requested', 'return_required', 'Delayed return tracking smoke',
    'return_required', now() - interval '4 days', now() + interval '1 day',
    'awaiting_carrier', 'admin-return-smoke'
) returning id as return_claim_id \gset

select commerce.record_claim_return_delivery(
    :return_claim_id, 'evt-return-carrier', 'return-shipment-smoke',
    'carrier_accepted', now() - interval '4 days', '{}'
);
select commerce.record_claim_return_delivery(
    :return_claim_id, 'evt-return-handoff', 'return-shipment-smoke',
    'recipient_handoff', now() - interval '3 days', '{}'
);
select commerce.record_claim_return_delivery(
    :return_claim_id, 'evt-return-out-of-order', 'return-shipment-smoke',
    'in_transit', now() - interval '2 days', '{}'
);
select commerce.record_claim_return_delivery(
    :return_claim_id, 'evt-return-handoff-older', 'return-shipment-smoke',
    'recipient_handoff', now() - interval '5 days', '{}'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_claim commerce.marketplace_claims%rowtype;
begin
    select * into v_order from commerce.orders
    where order_number = 'PROTECTED-ANOMALY-SMOKE-1';
    select * into v_claim from commerce.marketplace_claims
    where order_id = v_order.id;
    if v_claim.return_delivery_status <> 'recipient_handoff'
        or v_claim.return_recipient_handoff_at <> now() - interval '3 days'
        or (select count(*) from commerce.refund_requests where order_id = v_order.id)
            <> 0 then
        raise exception 'smoke: delayed or out-of-order return handoff regressed state or created a refund';
    end if;
end;
$$;

-- Full cancellation before any Transfer: the reserve is part of the seller's
-- economic entitlement and must be consumed by the refund exactly once.
insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'protected-cancel-buyer', 'protected-cancel-checkout',
    left(encode(extensions.digest('protected-cancel-checkout', 'sha256'), 'hex'), 32)
) returning id as cancel_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PROTECTED-CANCEL-SMOKE-1', :'cancel_checkout_group_id', :seller_id,
    'protected-cancel-buyer', 'eur', 10000, 10000,
    'protected-cancel-checkout',
    left(encode(extensions.digest('protected-cancel-checkout', 'sha256'), 'hex'), 32)
) returning id as cancel_order_id, public_id as cancel_order_public_id,
    version as cancel_order_version \gset

select result->>'financial_terms_hash' as cancel_terms_hash,
    (result->>'buyer_total_amount')::bigint as cancel_buyer_total
from (select commerce.lock_order_financial_terms(
    :'cancel_order_public_id', 'protected-cancel-buyer', 'quote-cancel-smoke-1',
    1200, 'eur', :cancel_order_version, 'delivery-cancel-smoke'
) result) locked \gset

select commerce.record_order_payment_projection(
    :'cancel_order_public_id', 'evt-cancel-payment-success', 704, 'succeeded',
    :cancel_buyer_total, 'eur', :'cancel_terms_hash', now(), '{}',
    'ch_cancel_smoke', 'pi_cancel_smoke'
);

select commerce.request_order_cancellation(
    :cancel_order_id, 'seller', 'protected-seller', 'item unavailable'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_authorization jsonb;
begin
    select * into v_order from commerce.orders where order_number = 'PROTECTED-CANCEL-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms where order_id = v_order.id;
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    select * into v_refund from commerce.refund_requests where order_id = v_order.id;
    v_authorization := commerce.refund_authorization_payload(v_refund.id);
    if v_settlement.status <> 'refund_pending'
        or v_settlement.authorized_seller_amount <> v_terms.seller_proceeds_amount
        or v_settlement.seller_reserve_liability_remaining_amount
            <> v_terms.seller_reserve_liability_amount then
        raise exception 'smoke: pre-Transfer cancellation mutated entitlement before provider success';
    end if;
    if v_refund.seller_recovery_amount <> v_terms.seller_proceeds_amount
        or v_refund.seller_reserve_offset_amount <> v_terms.seller_reserve_liability_amount
        or (v_authorization->>'sellerRecoveryAmount')::bigint <> 0
        or (v_authorization->>'sellerEntitlementReductionAmount')::bigint
            <> v_terms.seller_proceeds_amount
        or (v_authorization->>'authorizedSellerAmount')::bigint <> 0 then
        raise exception 'smoke: pre-Transfer cancellation omitted seller reserve recovery';
    end if;
    perform commerce.record_order_settlement_projection(
        v_order.public_id, 'evt-cancel-refund-success', 'refund', 806, 'succeeded',
        v_terms.buyer_total_amount, 'eur', now(), null,
        v_refund.id, v_refund.business_key, '{}'
    );
    select * into v_settlement from commerce.order_settlements where order_id = v_order.id;
    if v_settlement.status <> 'refunded'
        or v_settlement.authorized_seller_amount <> 0
        or v_settlement.total_transferred_amount <> 0
        or v_settlement.total_reversed_amount <> 0
        or v_settlement.total_refunded_amount <> v_terms.buyer_total_amount
        or v_settlement.seller_reserve_liability_remaining_amount <> 0
        or (select status from commerce.orders where id = v_order.id) <> 'cancelled'
        or (select status from commerce.order_cancellation_requests where order_id = v_order.id)
            <> 'completed' then
        raise exception 'smoke: full pre-Transfer cancellation refund did not conserve funds';
    end if;
end;
$$;

-- A buyer claim may consume the bounded commission and platform-funded shipping
-- in addition to seller recovery and the protection fee. This reproduces the
-- empty-package allocation used by the protected Courtside flow exactly.
select commerce.create_c2c_policy_revision(
    jsonb_build_object(
        'name', 'Protected full buyer claim smoke policy',
        'costEstimatesConfigured', true,
        'estimatedStripeCostAmount', 200,
        'estimatedCarrierCostAmount', 0,
        'configuredMinimumMarginAmount', 50,
        'buyerFeeRateBps', 500,
        'buyerFeeFixedAmount', 70,
        'buyerFeeMinimumAmount', 250,
        'buyerFeeMaximumAmount', 2000,
        'sellerFeeRateBps', 200,
        'sellerFeeMaximumAmount', 1000,
        'sellerReserveRateBps', 1000,
        'payoutDelayDays', 14,
        'highValueReviewAmount', 500000,
        'claimRatioReviewBps', 10000
    ),
    'admin-full-buyer-smoke',
    (select version from commerce.settings where id = 'default')
);

insert into commerce.sellers (
    kind, cms_user_id, slug, display_name, verification_status, verified_at, verified_by
) values (
    'user', 'protected-full-claim-seller', 'protected-full-claim-seller',
    'Protected full claim seller', 'verified', now(), 'smoke-admin'
) returning id as full_claim_seller_id \gset

insert into commerce.checkout_groups (
    buyer_cms_user_id, idempotency_key, request_hash
) values (
    'protected-full-claim-buyer', 'protected-full-claim-checkout',
    left(encode(extensions.digest('protected-full-claim-checkout', 'sha256'), 'hex'), 32)
) returning id as full_claim_checkout_group_id \gset

insert into commerce.orders (
    order_number, checkout_group_id, seller_id, buyer_cms_user_id,
    currency, subtotal_amount, total_amount, idempotency_key, request_hash
) values (
    'PROTECTED-FULL-CLAIM-SMOKE-1', :'full_claim_checkout_group_id',
    :full_claim_seller_id, 'protected-full-claim-buyer', 'eur', 13500, 13500,
    'protected-full-claim-checkout',
    left(encode(extensions.digest('protected-full-claim-checkout', 'sha256'), 'hex'), 32)
) returning id as full_claim_order_id, public_id as full_claim_order_public_id,
    version as full_claim_order_version \gset

select result->>'financial_terms_hash' as full_claim_terms_hash,
    (result->>'buyer_total_amount')::bigint as full_claim_buyer_total,
    (result->>'buyer_protection_fee_amount')::bigint as full_claim_protection_fee
from (select commerce.lock_order_financial_terms(
    :'full_claim_order_public_id', 'protected-full-claim-buyer',
    'quote-full-claim-smoke-1', 450, 'eur', :full_claim_order_version,
    'delivery-full-claim-smoke'
) result) locked \gset

do $$
declare v_terms commerce.order_financial_terms%rowtype;
begin
    select terms.* into v_terms
    from commerce.order_financial_terms terms
    join commerce.orders order_row on order_row.id = terms.order_id
    where order_row.order_number = 'PROTECTED-FULL-CLAIM-SMOKE-1';
    if v_terms.buyer_total_amount <> 14695
        or v_terms.buyer_protection_fee_amount <> 745
        or v_terms.seller_proceeds_amount <> 13230
        or v_terms.platform_retained_amount <> 1465
        or v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount <> 720 then
        raise exception 'smoke: full buyer claim fixture no longer matches immutable Courtside terms';
    end if;
end;
$$;

select commerce.record_order_payment_projection(
    :'full_claim_order_public_id', 'evt-full-claim-payment-success', 710, 'succeeded',
    :full_claim_buyer_total, 'eur', :'full_claim_terms_hash', now(), '{}',
    'ch_full_claim_smoke', 'pi_full_claim_smoke'
);
select commerce.record_order_fulfillment_projection(
    :'full_claim_order_public_id', 'evt-full-claim-label', 'label_created', now(),
    'shipment-full-claim-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'full_claim_order_public_id', 'evt-full-claim-carrier', 'carrier_accepted', now(),
    'shipment-full-claim-smoke'
);
select commerce.record_order_fulfillment_projection(
    :'full_claim_order_public_id', 'evt-full-claim-collected',
    'collected_by_recipient', now(), 'shipment-full-claim-smoke', now()
);

select (result->>'id')::bigint as full_claim_id,
    (result->>'version')::integer as full_claim_version
from (select commerce.open_marketplace_claim(
    :full_claim_order_id, 'protected-full-claim-buyer', 'empty_package',
    'The sealed parcel contained no racket.', :full_claim_buyer_total
) result) opened \gset

do $$
declare
    v_claim commerce.marketplace_claims%rowtype;
    v_terms commerce.order_financial_terms%rowtype;
begin
    select claim.* into v_claim
    from commerce.marketplace_claims claim
    join commerce.orders order_row on order_row.id = claim.order_id
    where order_row.order_number = 'PROTECTED-FULL-CLAIM-SMOKE-1';
    select * into v_terms from commerce.order_financial_terms
    where order_id = v_claim.order_id;
    begin
        perform commerce.resolve_marketplace_claim(
            v_claim.id, 'split', v_terms.buyer_total_amount, 1,
            v_terms.buyer_protection_fee_amount, 'Invalid preserved seller cent',
            'admin', 'admin-full-claim-smoke', v_claim.version
        );
        raise exception 'smoke: platform contribution cap preserved seller money during a full refund';
    exception when others then
        if sqlerrm = 'smoke: platform contribution cap preserved seller money during a full refund'
            or sqlerrm <> 'validation: claim refund exceeds immutable platform contribution' then
            raise;
        end if;
    end;
end;
$$;

select commerce.resolve_marketplace_claim(
    :full_claim_id, 'buyer', :full_claim_buyer_total, 0,
    :full_claim_protection_fee, 'Empty package evidence accepted',
    'admin', 'admin-full-claim-smoke', :full_claim_version
);

do $$
declare
    v_terms commerce.order_financial_terms%rowtype;
    v_refund commerce.refund_requests%rowtype;
    v_platform_contribution bigint;
begin
    select terms.* into v_terms
    from commerce.order_financial_terms terms
    join commerce.orders order_row on order_row.id = terms.order_id
    where order_row.order_number = 'PROTECTED-FULL-CLAIM-SMOKE-1';
    select * into v_refund from commerce.refund_requests
    where order_id = v_terms.order_id;
    v_platform_contribution := v_refund.requested_amount
        - v_refund.protection_fee_refund_amount - v_refund.seller_recovery_amount;
    if v_refund.status <> 'requested'
        or v_refund.requires_finance_approval is not true
        or v_refund.requested_amount <> 14695
        or v_refund.protection_fee_refund_amount <> 745
        or v_refund.seller_recovery_amount <> 13230
        or v_platform_contribution <> 720
        or v_platform_contribution
            <> v_terms.platform_retained_amount - v_terms.buyer_protection_fee_amount
        or v_refund.requested_amount <> v_refund.protection_fee_refund_amount
            + v_refund.seller_recovery_amount + v_platform_contribution
        or not exists (
            select 1 from commerce.marketplace_claim_events claim_event
            where claim_event.claim_id = v_refund.claim_id
              and (claim_event.data->>'platformContributionAmount')::bigint = 720
        ) then
        raise exception 'smoke: full buyer refund allocation does not conserve immutable terms';
    end if;
end;
$$;

select id as full_claim_refund_request_id, business_key as full_claim_refund_business_key,
    version as full_claim_refund_version
from commerce.refund_requests where order_id = :full_claim_order_id \gset

select commerce.review_refund_request(
    :full_claim_refund_request_id, 'approved', 'admin-full-claim-review',
    'Full buyer claim financial allocation reviewed', :full_claim_refund_version
);

select commerce.record_order_settlement_projection(
    :'full_claim_order_public_id', 'evt-full-claim-refund-success',
    'refund', 809, 'succeeded', :full_claim_buyer_total, 'eur', now(), null,
    :full_claim_refund_request_id, :'full_claim_refund_business_key', '{}'
);

do $$
declare
    v_order commerce.orders%rowtype;
    v_settlement commerce.order_settlements%rowtype;
begin
    select * into v_order from commerce.orders
    where order_number = 'PROTECTED-FULL-CLAIM-SMOKE-1';
    select * into v_settlement from commerce.order_settlements
    where order_id = v_order.id;
    if v_order.status <> 'completed'
        or v_settlement.status <> 'refunded'
        or v_settlement.total_refunded_amount <> 14695
        or v_settlement.authorized_seller_amount <> 0
        or v_settlement.seller_reserve_liability_remaining_amount <> 0
        or v_settlement.platform_gross_remainder_amount <> 0
        or (select status from commerce.marketplace_claims where order_id = v_order.id)
            <> 'resolved_buyer' then
        raise exception 'smoke: confirmed full buyer claim did not terminalize exactly once';
    end if;
end;
$$;

rollback;
