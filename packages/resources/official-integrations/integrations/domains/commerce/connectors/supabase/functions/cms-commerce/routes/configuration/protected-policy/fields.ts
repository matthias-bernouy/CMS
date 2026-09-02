import { HttpError } from "../../../core/errors.ts";
import { booleanValue, integer, text } from "../../../core/records.ts";
import type { JsonRecord } from "../../../core/types.ts";

const requiredTextFields = [
    "name",
    "shippingBeneficiary",
    "buyerFeeBasis",
    "buyerFeeRefundPolicy",
    "sellerFeeBasis",
    "sellerFeeRefundPolicy",
] as const;
const optionalTextFields = ["subsidyReason"] as const;
const requiredIntegerFields = [
    "buyerFeeRateBps",
    "buyerFeeFixedAmount",
    "sellerFeeRateBps",
    "sellerFeeFixedAmount",
    "estimatedStripeCostAmount",
    "estimatedCarrierCostAmount",
    "platformRiskReserveContributionAmount",
    "configuredMinimumMarginAmount",
    "paymentWindowMinutes",
    "sellerHandoffHours",
    "scanGraceHours",
    "claimWindowHours",
    "sellerResponseHours",
    "returnShipHours",
    "financeReviewThresholdAmount",
    "dualApprovalThresholdAmount",
    "sellerReserveRateBps",
    "payoutDelayDays",
    "sellerReserveLiabilityDays",
    "orderTransferLimitAmount",
    "velocityLimitAmount",
    "highValueReviewAmount",
    "claimRatioReviewBps",
    "chargebackRatioReviewBps",
] as const;
const optionalIntegerFields = [
    "buyerFeeMinimumAmount",
    "buyerFeeMaximumAmount",
    "sellerFeeMinimumAmount",
    "sellerFeeMaximumAmount",
    "subsidyMaximumDeficitAmount",
] as const;
const requiredBooleanFields = ["costEstimatesConfigured", "subsidyOverride"] as const;
const allowedFields = new Set<string>([
    "expectedSettingsVersion",
    ...requiredTextFields,
    ...optionalTextFields,
    ...requiredIntegerFields,
    ...optionalIntegerFields,
    ...requiredBooleanFields,
]);

export function protectedPolicyPayload(body: JsonRecord): JsonRecord {
    assertAllowedFields(body);
    const payload: JsonRecord = {};
    setRequiredTextFields(payload, body);
    setOptionalTextFields(payload, body);
    for (const field of requiredIntegerFields) {
        payload[field] = integer(body[field], field, true)!;
    }
    for (const field of optionalIntegerFields) {
        const value = integer(body[field], field);
        if (value !== undefined) {
            payload[field] = value;
        }
    }
    for (const field of requiredBooleanFields) {
        const value = booleanValue(body[field], field);
        if (value === undefined) {
            throw new HttpError(400, `${field} is required`);
        }
        payload[field] = value;
    }
    return payload;
}

function assertAllowedFields(body: JsonRecord): void {
    const unexpected = Object.keys(body).find((key) => !allowedFields.has(key));
    if (unexpected) {
        throw new HttpError(400, `${unexpected} is not allowed in a protected C2C policy revision`);
    }
}

function setRequiredTextFields(payload: JsonRecord, body: JsonRecord): void {
    for (const field of requiredTextFields) {
        const value = text(body[field]);
        if (!value) {
            throw new HttpError(400, `${field} is required`);
        }
        payload[field] = value;
    }
    assertAllowedValue(payload.shippingBeneficiary, "shippingBeneficiary", ["platform", "seller"]);
    assertAllowedValue(payload.buyerFeeBasis, "buyerFeeBasis", ["merchandise", "merchandise_and_shipping"]);
    assertAllowedValue(payload.sellerFeeBasis, "sellerFeeBasis", ["merchandise", "merchandise_and_shipping"]);
    assertAllowedValue(payload.buyerFeeRefundPolicy, "buyerFeeRefundPolicy", [
        "always",
        "never",
        "proportional",
        "resolution_defined",
    ]);
    assertAllowedValue(payload.sellerFeeRefundPolicy, "sellerFeeRefundPolicy", ["never"]);
}

function setOptionalTextFields(payload: JsonRecord, body: JsonRecord): void {
    for (const field of optionalTextFields) {
        const value = text(body[field]);
        if (value !== undefined) {
            payload[field] = value;
        }
    }
}

function assertAllowedValue(value: unknown, field: string, allowed: string[]): void {
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}`);
    }
}
