import { componentRows, feePolicyRow, protectionPolicyRow, sellerRiskPolicyRow, settingsRow, subsidyRows } from "./raw";

type Row = Record<string, unknown>;
type Options = {
    feePolicy?: Row;
    protectionPolicy?: Row;
    sellerRiskPolicy?: Row;
    settings?: Row;
    components?: Row[];
    subsidies?: Row[];
};

export function expectedC2cPolicyResponse(options: Options = {}): Row {
    const settings = settingsOutput(options.settings ?? settingsRow);
    const fee = feeOutput(options.feePolicy ?? feePolicyRow);
    const protection = protectionOutput(options.protectionPolicy ?? protectionPolicyRow);
    const risk = riskOutput(options.sellerRiskPolicy ?? sellerRiskPolicyRow);
    const components = (options.components ?? componentRows).map(componentOutput);
    const subsidies = (options.subsidies ?? subsidyRows).map(subsidyOutput);
    return {
        settings,
        activePolicy: {
            id: fee.id,
            policyKey: fee.policyKey,
            version: fee.version,
            name: fee.name,
            status: fee.status,
            currency: fee.currency,
            fee,
            buyerProtection: components.find((item) => item.componentKey === "buyer_protection"),
            sellerCommission: components.find((item) => item.componentKey === "seller_commission"),
            protection,
            sellerRisk: risk,
            subsidy: subsidies[0] ?? null,
        },
        feePolicy: fee,
        protectionPolicy: protection,
        sellerRiskPolicy: risk,
        components,
        subsidyOverrides: subsidies,
    };
}

export function expectedC2cSourceResponse(response: Row): Row {
    const active = response.activePolicy as Row;
    const components = response.components as Row[];
    const subsidies = response.subsidyOverrides as Row[];
    return {
        settings: response.settings,
        activePolicy: {
            id: active.id,
            policyKey: active.policyKey,
            version: active.version,
            name: active.name,
            status: active.status,
            currency: active.currency,
            fee: active.fee,
            buyerProtection: sourceComponent(active.buyerProtection as Row),
            sellerCommission: sourceComponent(active.sellerCommission as Row),
            protection: active.protection,
            sellerRisk: active.sellerRisk,
            subsidy: active.subsidy === null ? null : sourceSubsidy(active.subsidy as Row, true),
        },
        feePolicy: sourceFields(response.feePolicy as Row, [
            "id",
            "status",
            "costEstimatesConfigured",
            "subsidyOverride",
        ]),
        protectionPolicy: sourceFields(response.protectionPolicy as Row, [
            "id",
            "status",
            "paymentWindowMinutes",
            "claimWindowHours",
            "financeReviewThresholdAmount",
        ]),
        sellerRiskPolicy: sourceFields(response.sellerRiskPolicy as Row, [
            "id",
            "status",
            "payoutDelayDays",
            "reserveLiabilityDays",
        ]),
        components: components.map((row) => sourceFields(row, ["id", "rateBps", "fixedAmount"])),
        subsidyOverrides: subsidies.map((row) => sourceSubsidy(row)),
    };
}

function settingsOutput(row: Row): Row {
    return {
        id: row.id,
        mode: row.mode,
        defaultCurrency: row.default_currency,
        activeC2cFeePolicyId: row.active_c2c_fee_policy_id,
        activeC2cProtectionPolicyId: row.active_c2c_protection_policy_id,
        activeC2cSellerRiskPolicyId: row.active_c2c_seller_risk_policy_id,
        version: row.version,
        updatedAt: row.updated_at,
    };
}

function feeOutput(row: Row): Row {
    return {
        id: row.id,
        policyKey: row.policy_key,
        version: row.version,
        name: row.name,
        status: row.status,
        currency: row.currency,
        shippingBeneficiary: row.shipping_beneficiary,
        estimatedStripeCostAmount: row.estimated_stripe_cost_amount,
        estimatedCarrierCostAmount: row.estimated_carrier_cost_amount,
        platformRiskReserveContributionAmount: row.platform_risk_reserve_contribution_amount,
        configuredMinimumMarginAmount: row.configured_minimum_margin_amount,
        costEstimatesConfigured: row.cost_estimates_configured,
        subsidyOverride: row.subsidy_override,
        subsidyReason: row.subsidy_reason,
        publishedAt: row.published_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

function protectionOutput(row: Row): Row {
    return {
        id: row.id,
        policyKey: row.policy_key,
        version: row.version,
        name: row.name,
        status: row.status,
        currency: row.currency,
        paymentWindowMinutes: row.payment_window_minutes,
        sellerHandoffHours: row.seller_handoff_hours,
        scanGraceHours: row.scan_grace_hours,
        claimWindowHours: row.claim_window_hours,
        sellerResponseHours: row.seller_response_hours,
        returnShipHours: row.return_ship_hours,
        financeReviewThresholdAmount: row.finance_review_threshold_amount,
        dualApprovalThresholdAmount: row.dual_approval_threshold_amount,
        publishedAt: row.published_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

function riskOutput(row: Row): Row {
    return {
        id: row.id,
        policyKey: row.policy_key,
        version: row.version,
        name: row.name,
        status: row.status,
        currency: row.currency,
        reserveRateBps: row.reserve_rate_bps,
        payoutDelayDays: row.payout_delay_days,
        reserveLiabilityDays: row.reserve_liability_days,
        orderTransferLimitAmount: row.order_transfer_limit_amount,
        velocityLimitAmount: row.velocity_limit_amount,
        highValueReviewAmount: row.high_value_review_amount,
        claimRatioReviewBps: row.claim_ratio_review_bps,
        chargebackRatioReviewBps: row.chargeback_ratio_review_bps,
        publishedAt: row.published_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
    };
}

function componentOutput(row: Row): Row {
    return {
        id: row.id,
        feePolicyId: row.fee_policy_id,
        componentKey: row.component_key,
        payer: row.payer,
        basis: row.basis,
        rateBps: row.rate_bps,
        fixedAmount: row.fixed_amount,
        minimumAmount: row.minimum_amount,
        maximumAmount: row.maximum_amount,
        roundingMode: row.rounding_mode,
        refundPolicy: row.refund_policy,
        position: row.position,
        createdAt: row.created_at,
    };
}

function subsidyOutput(row: Row): Row {
    return {
        id: row.id,
        feePolicyId: row.fee_policy_id,
        maximumDeficitAmount: row.maximum_deficit_amount,
        reason: row.reason,
        approvedBy: row.approved_by,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
    };
}

function sourceComponent(row: Row): Row {
    return sourceFields(row, [
        "id",
        "componentKey",
        "payer",
        "basis",
        "rateBps",
        "fixedAmount",
        "minimumAmount",
        "maximumAmount",
        "roundingMode",
        "refundPolicy",
    ]);
}

function sourceSubsidy(row: Row, includeApprover = false): Row {
    return sourceFields(row, [
        "id",
        "maximumDeficitAmount",
        "reason",
        ...(includeApprover ? ["approvedBy"] : []),
        "createdAt",
    ]);
}

function sourceFields(row: Row, fields: string[]): Row {
    return Object.fromEntries(
        fields.flatMap((field) => (Object.prototype.hasOwnProperty.call(row, field) ? [[field, row[field]]] : [])),
    );
}
