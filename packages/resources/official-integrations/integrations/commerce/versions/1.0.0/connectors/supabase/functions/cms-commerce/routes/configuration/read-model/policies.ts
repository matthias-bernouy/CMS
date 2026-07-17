import { HttpError } from "../../../core/errors.ts";
import { json } from "../../../core/http.ts";
import { camelize, isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

const functionName = "get_c2c_policy_configuration_read_model";
const settingsFields = [
    "id", "mode", "default_currency", "active_c2c_fee_policy_id",
    "active_c2c_protection_policy_id", "active_c2c_seller_risk_policy_id",
    "version", "updated_at",
] as const;
const feeFields = [
    "id", "policy_key", "version", "name", "status", "currency",
    "shipping_beneficiary", "estimated_stripe_cost_amount",
    "estimated_carrier_cost_amount", "platform_risk_reserve_contribution_amount",
    "configured_minimum_margin_amount", "cost_estimates_configured",
    "subsidy_override", "subsidy_reason", "published_at", "created_by", "created_at",
] as const;
const protectionFields = [
    "id", "policy_key", "version", "name", "status", "currency",
    "payment_window_minutes", "seller_handoff_hours", "scan_grace_hours",
    "claim_window_hours", "seller_response_hours", "return_ship_hours",
    "finance_review_threshold_amount", "dual_approval_threshold_amount",
    "published_at", "created_by", "created_at",
] as const;
const riskFields = [
    "id", "policy_key", "version", "name", "status", "currency", "reserve_rate_bps",
    "payout_delay_days", "reserve_liability_days", "order_transfer_limit_amount",
    "velocity_limit_amount", "high_value_review_amount", "claim_ratio_review_bps",
    "chargeback_ratio_review_bps", "published_at", "created_by", "created_at",
] as const;
const componentFields = [
    "id", "fee_policy_id", "component_key", "payer", "basis", "rate_bps",
    "fixed_amount", "minimum_amount", "maximum_amount", "rounding_mode",
    "refund_policy", "position", "created_at",
] as const;
const subsidyFields = [
    "id", "fee_policy_id", "maximum_deficit_amount", "reason", "approved_by",
    "expires_at", "created_at",
] as const;

export async function getC2cPolicies(): Promise<Response> {
    const result = await rpc(functionName, {});
    if (!isRecord(result) || typeof result.state !== "string") throw invalidResponse();
    if (result.state === "settings_missing") {
        throw new HttpError(500, "commerce settings are missing");
    }
    if (result.state !== "ok") throw invalidResponse();

    const settings = projectRequired(result.settings, settingsFields);
    const feePolicy = projectOptional(result.fee_policy, feeFields);
    const protectionPolicy = projectOptional(result.protection_policy, protectionFields);
    const sellerRiskPolicy = projectOptional(result.seller_risk_policy, riskFields);
    if (!feePolicy || !protectionPolicy || !sellerRiskPolicy) {
        throw new HttpError(500, "active protected C2C policy revision is incomplete");
    }
    const components = projectArray(result.components, componentFields);
    const subsidyOverrides = projectArray(result.subsidy_overrides, subsidyFields);

    const publicSettings = camelize(settings) as JsonRecord;
    const publicFeePolicy = camelize(feePolicy) as JsonRecord;
    const publicProtectionPolicy = camelize(protectionPolicy) as JsonRecord;
    const publicSellerRiskPolicy = camelize(sellerRiskPolicy) as JsonRecord;
    const publicComponents = camelize(components) as JsonRecord[];
    const publicSubsidyOverrides = camelize(subsidyOverrides) as JsonRecord[];
    const buyerProtection = publicComponents.find(
        component => component.componentKey === "buyer_protection",
    );
    const sellerCommission = publicComponents.find(
        component => component.componentKey === "seller_commission",
    );
    if (!buyerProtection || !sellerCommission) {
        throw new HttpError(500, "active protected C2C fee components are incomplete");
    }
    return json({
        settings: publicSettings,
        activePolicy: {
            id: publicFeePolicy.id,
            policyKey: publicFeePolicy.policyKey,
            version: publicFeePolicy.version,
            name: publicFeePolicy.name,
            status: publicFeePolicy.status,
            currency: publicFeePolicy.currency,
            fee: publicFeePolicy,
            buyerProtection,
            sellerCommission,
            protection: publicProtectionPolicy,
            sellerRisk: publicSellerRiskPolicy,
            subsidy: publicSubsidyOverrides[0] ?? null,
        },
        feePolicy: publicFeePolicy,
        protectionPolicy: publicProtectionPolicy,
        sellerRiskPolicy: publicSellerRiskPolicy,
        components: publicComponents,
        subsidyOverrides: publicSubsidyOverrides,
    });
}

function projectArray(value: unknown, fields: readonly string[]): JsonRecord[] {
    if (!Array.isArray(value)) throw invalidResponse();
    return value.map(row => projectRequired(row, fields));
}

function projectOptional(value: unknown, fields: readonly string[]): JsonRecord | null {
    return value === null ? null : projectRequired(value, fields);
}

function projectRequired(value: unknown, fields: readonly string[]): JsonRecord {
    if (!isRecord(value) || fields.some(field => !Object.hasOwn(value, field))) {
        throw invalidResponse();
    }
    return Object.fromEntries(fields.map(field => [field, value[field]]));
}

function invalidResponse(): HttpError {
    return new HttpError(502, `${functionName} returned an invalid response`);
}
