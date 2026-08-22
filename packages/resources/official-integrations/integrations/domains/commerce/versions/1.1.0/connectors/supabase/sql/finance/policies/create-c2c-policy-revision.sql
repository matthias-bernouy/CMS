

create or replace function commerce.create_c2c_policy_revision(
    p_payload jsonb,
    p_actor_id text,
    p_expected_settings_version integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    v_settings commerce.settings%rowtype;
    v_fee commerce.fee_policies%rowtype;
    v_protection commerce.protection_policies%rowtype;
    v_settlement commerce.order_settlements%rowtype;
    v_risk commerce.seller_risk_policies%rowtype;
    v_version integer;
    v_subsidy_amount bigint;
    v_subsidy_reason text;
    v_guaranteed_fee_floor bigint;
    v_required_revenue_floor bigint;
    v_policy_deficit bigint;
begin
    if p_actor_id is null or length(btrim(p_actor_id)) = 0 then
        raise exception 'forbidden: admin actor is required';
    end if;
    if jsonb_typeof(p_payload) <> 'object' then
        raise exception 'validation: policy payload must be an object';
    end if;
    if coalesce(nullif(p_payload->>'sellerFeeRefundPolicy', ''), 'never') <> 'never' then
        raise exception 'validation: seller commission refund policy is not implemented; use never';
    end if;
    if not coalesce((p_payload->>'costEstimatesConfigured')::boolean, false)
        and not coalesce((p_payload->>'subsidyOverride')::boolean, false) then
        raise exception 'validation: unconfigured cost estimates require an audited subsidy override';
    end if;
    if coalesce((p_payload->>'costEstimatesConfigured')::boolean, false)
        and coalesce((p_payload->>'estimatedStripeCostAmount')::bigint, 0) <= 0 then
        raise exception 'validation: configured provider costs require a positive Stripe cost estimate';
    end if;
    if (nullif(p_payload->>'buyerFeeMaximumAmount', '') is not null
            and coalesce((p_payload->>'buyerFeeFixedAmount')::bigint, 0)
                > (p_payload->>'buyerFeeMaximumAmount')::bigint)
        or (nullif(p_payload->>'sellerFeeMaximumAmount', '') is not null
            and coalesce((p_payload->>'sellerFeeFixedAmount')::bigint, 0)
                > (p_payload->>'sellerFeeMaximumAmount')::bigint) then
        raise exception 'validation: fee fixed amount cannot exceed its maximum amount';
    end if;
    v_subsidy_amount := nullif(p_payload->>'subsidyMaximumDeficitAmount', '')::bigint;
    v_subsidy_reason := nullif(p_payload->>'subsidyReason', '');
    v_guaranteed_fee_floor :=
        least(
            greatest(
                coalesce((p_payload->>'buyerFeeFixedAmount')::bigint, 0),
                coalesce((p_payload->>'buyerFeeMinimumAmount')::bigint, 0)
            ),
            coalesce((p_payload->>'buyerFeeMaximumAmount')::bigint, 9007199254740991)
        )
        + least(
            greatest(
                coalesce((p_payload->>'sellerFeeFixedAmount')::bigint, 0),
                coalesce((p_payload->>'sellerFeeMinimumAmount')::bigint, 0)
            ),
            coalesce((p_payload->>'sellerFeeMaximumAmount')::bigint, 9007199254740991)
        );
    v_required_revenue_floor :=
        coalesce((p_payload->>'estimatedStripeCostAmount')::bigint, 0)
        + coalesce((p_payload->>'estimatedCarrierCostAmount')::bigint, 0)
        + coalesce((p_payload->>'platformRiskReserveContributionAmount')::bigint, 0)
        + coalesce((p_payload->>'configuredMinimumMarginAmount')::bigint, 0);
    v_policy_deficit := greatest(0, v_required_revenue_floor - v_guaranteed_fee_floor);
    if coalesce((p_payload->>'costEstimatesConfigured')::boolean, false)
        and v_policy_deficit > 0
        and not coalesce((p_payload->>'subsidyOverride')::boolean, false) then
        raise exception 'validation: guaranteed fee floor does not cover configured costs and minimum margin';
    end if;
    if coalesce((p_payload->>'subsidyOverride')::boolean, false)
        and (v_subsidy_amount is null or v_subsidy_reason is null) then
        raise exception 'validation: an audited subsidy amount and reason are required';
    end if;
    if coalesce((p_payload->>'subsidyOverride')::boolean, false)
        and v_subsidy_amount < v_policy_deficit then
        raise exception 'validation: audited subsidy maximum does not cover the configured policy deficit';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('commerce-c2c-policy', 0));
    select * into v_settings from commerce.settings where id = 'default' for update;
    if v_settings.version is distinct from p_expected_settings_version then
        raise exception 'conflict: stale settings version';
    end if;
    select greatest(
        coalesce((select max(version) from commerce.fee_policies where policy_key = 'c2c-default'), 0),
        coalesce((select max(version) from commerce.protection_policies where policy_key = 'c2c-default'), 0),
        coalesce((select max(version) from commerce.seller_risk_policies where policy_key = 'c2c-default'), 0)
    ) + 1 into v_version;

    insert into commerce.fee_policies (
        policy_key, version, name, status, currency, shipping_beneficiary,
        estimated_stripe_cost_amount, estimated_carrier_cost_amount,
        platform_risk_reserve_contribution_amount, configured_minimum_margin_amount,
        cost_estimates_configured, subsidy_override, subsidy_reason, published_at, created_by
    ) values (
        'c2c-default', v_version,
        coalesce(nullif(p_payload->>'name', ''), 'Protected C2C revision ' || v_version),
        'published', 'eur', coalesce(nullif(p_payload->>'shippingBeneficiary', ''), 'platform'),
        coalesce((p_payload->>'estimatedStripeCostAmount')::bigint, 0),
        coalesce((p_payload->>'estimatedCarrierCostAmount')::bigint, 0),
        coalesce((p_payload->>'platformRiskReserveContributionAmount')::bigint, 0),
        coalesce((p_payload->>'configuredMinimumMarginAmount')::bigint, 0),
        coalesce((p_payload->>'costEstimatesConfigured')::boolean, false),
        coalesce((p_payload->>'subsidyOverride')::boolean, false),
        nullif(p_payload->>'subsidyReason', ''), now(), p_actor_id
    ) returning * into v_fee;

    insert into commerce.fee_policy_components (
        fee_policy_id, component_key, payer, basis, rate_bps, fixed_amount,
        minimum_amount, maximum_amount, refund_policy, position
    ) values
    (
        v_fee.id, 'buyer_protection', 'buyer',
        coalesce(nullif(p_payload->>'buyerFeeBasis', ''), 'merchandise'),
        coalesce((p_payload->>'buyerFeeRateBps')::integer, 0),
        coalesce((p_payload->>'buyerFeeFixedAmount')::bigint, 0),
        nullif(p_payload->>'buyerFeeMinimumAmount', '')::bigint,
        nullif(p_payload->>'buyerFeeMaximumAmount', '')::bigint,
        coalesce(nullif(p_payload->>'buyerFeeRefundPolicy', ''), 'resolution_defined'), 10
    ),
    (
        v_fee.id, 'seller_commission', 'seller',
        coalesce(nullif(p_payload->>'sellerFeeBasis', ''), 'merchandise'),
        coalesce((p_payload->>'sellerFeeRateBps')::integer, 0),
        coalesce((p_payload->>'sellerFeeFixedAmount')::bigint, 0),
        nullif(p_payload->>'sellerFeeMinimumAmount', '')::bigint,
        nullif(p_payload->>'sellerFeeMaximumAmount', '')::bigint,
        'never', 20
    );

    insert into commerce.protection_policies (
        policy_key, version, name, status, currency, payment_window_minutes,
        seller_handoff_hours, scan_grace_hours, claim_window_hours,
        seller_response_hours, return_ship_hours, finance_review_threshold_amount,
        dual_approval_threshold_amount, published_at, created_by
    ) values (
        'c2c-default', v_version, v_fee.name, 'published', 'eur',
        coalesce((p_payload->>'paymentWindowMinutes')::integer, 30),
        coalesce((p_payload->>'sellerHandoffHours')::integer, 72),
        coalesce((p_payload->>'scanGraceHours')::integer, 48),
        coalesce((p_payload->>'claimWindowHours')::integer, 48),
        coalesce((p_payload->>'sellerResponseHours')::integer, 72),
        coalesce((p_payload->>'returnShipHours')::integer, 168),
        coalesce((p_payload->>'financeReviewThresholdAmount')::bigint, 50000),
        coalesce((p_payload->>'dualApprovalThresholdAmount')::bigint, 100000),
        now(), p_actor_id
    ) returning * into v_protection;

    insert into commerce.seller_risk_policies (
        policy_key, version, name, status, currency, reserve_rate_bps,
        payout_delay_days, reserve_liability_days, order_transfer_limit_amount, velocity_limit_amount,
        high_value_review_amount, claim_ratio_review_bps,
        chargeback_ratio_review_bps, published_at, created_by
    ) values (
        'c2c-default', v_version, v_fee.name, 'published', 'eur',
        coalesce((p_payload->>'sellerReserveRateBps')::integer, 1000),
        coalesce((p_payload->>'payoutDelayDays')::integer, 14),
        coalesce((p_payload->>'sellerReserveLiabilityDays')::integer, 120),
        coalesce((p_payload->>'orderTransferLimitAmount')::bigint, 500000),
        coalesce((p_payload->>'velocityLimitAmount')::bigint, 1000000),
        coalesce((p_payload->>'highValueReviewAmount')::bigint, 50000),
        coalesce((p_payload->>'claimRatioReviewBps')::integer, 1000),
        coalesce((p_payload->>'chargebackRatioReviewBps')::integer, 200),
        now(), p_actor_id
    ) returning * into v_risk;

    if v_fee.subsidy_override then
        insert into commerce.financial_subsidy_overrides (
            fee_policy_id, maximum_deficit_amount, reason, approved_by
        ) values (v_fee.id, v_subsidy_amount, v_subsidy_reason, p_actor_id);
    end if;

    update commerce.settings set
        active_c2c_fee_policy_id = v_fee.id,
        active_c2c_protection_policy_id = v_protection.id,
        active_c2c_seller_risk_policy_id = v_risk.id
    where id = 'default';
    return jsonb_build_object(
        'feePolicyId', v_fee.id,
        'protectionPolicyId', v_protection.id,
        'sellerRiskPolicyId', v_risk.id,
        'policyVersion', v_version,
        'settingsVersion', v_settings.version + 1
    );
end;
$$;