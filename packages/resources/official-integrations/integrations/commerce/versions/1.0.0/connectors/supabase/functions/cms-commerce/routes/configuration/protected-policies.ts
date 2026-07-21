import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { booleanValue, camelize, integer, readJsonObject, text } from "../../core/records.ts";
import { rpc } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

export async function createC2cPolicyRevision(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const allowedFields = new Set([
        "expectedSettingsVersion",
        "name",
        "shippingBeneficiary",
        "buyerFeeBasis",
        "buyerFeeRateBps",
        "buyerFeeFixedAmount",
        "buyerFeeMinimumAmount",
        "buyerFeeMaximumAmount",
        "buyerFeeRefundPolicy",
        "sellerFeeBasis",
        "sellerFeeRateBps",
        "sellerFeeFixedAmount",
        "sellerFeeMinimumAmount",
        "sellerFeeMaximumAmount",
        "sellerFeeRefundPolicy",
        "costEstimatesConfigured",
        "estimatedStripeCostAmount",
        "estimatedCarrierCostAmount",
        "platformRiskReserveContributionAmount",
        "configuredMinimumMarginAmount",
        "subsidyOverride",
        "subsidyReason",
        "subsidyMaximumDeficitAmount",
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
    ]);
    const unexpected = Object.keys(body).find((key) => !allowedFields.has(key));
    if (unexpected) {
        throw new HttpError(400, `${unexpected} is not allowed in a protected C2C policy revision`);
    }
    const payload: JsonRecord = {};
    const requiredTextFields = [
        "name",
        "shippingBeneficiary",
        "buyerFeeBasis",
        "buyerFeeRefundPolicy",
        "sellerFeeBasis",
        "sellerFeeRefundPolicy",
    ];
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
    const optionalTextFields = ["subsidyReason"];
    for (const field of optionalTextFields) {
        const value = text(body[field]);
        if (value !== undefined) {
            payload[field] = value;
        }
    }
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
    ];
    for (const field of requiredIntegerFields) {
        payload[field] = integer(body[field], field, true)!;
    }
    for (const field of [
        "buyerFeeMinimumAmount",
        "buyerFeeMaximumAmount",
        "sellerFeeMinimumAmount",
        "sellerFeeMaximumAmount",
        "subsidyMaximumDeficitAmount",
    ]) {
        const value = integer(body[field], field);
        if (value !== undefined) {
            payload[field] = value;
        }
    }
    for (const field of ["costEstimatesConfigured", "subsidyOverride"]) {
        const value = booleanValue(body[field], field);
        if (value === undefined) {
            throw new HttpError(400, `${field} is required`);
        }
        payload[field] = value;
    }
    assertIntegerRanges(payload);
    const result = await rpc("create_c2c_policy_revision", {
        p_payload: payload,
        p_actor_id: cmsUserId(request),
        p_expected_settings_version: integer(body.expectedSettingsVersion, "expectedSettingsVersion", true),
    });
    return json(camelize(result), 201);
}

function assertAllowedValue(value: unknown, field: string, allowed: string[]): void {
    if (typeof value !== "string" || !allowed.includes(value)) {
        throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}`);
    }
}

function assertIntegerRanges(payload: JsonRecord): void {
    const ranges: Record<string, [number, number]> = {
        buyerFeeRateBps: [0, 10_000],
        sellerFeeRateBps: [0, 10_000],
        sellerReserveRateBps: [0, 9_999],
        claimRatioReviewBps: [0, 10_000],
        chargebackRatioReviewBps: [0, 10_000],
        paymentWindowMinutes: [1, 1_440],
        sellerHandoffHours: [1, 720],
        scanGraceHours: [1, 720],
        claimWindowHours: [1, 720],
        sellerResponseHours: [1, 720],
        returnShipHours: [1, 2_160],
        payoutDelayDays: [0, 31],
        sellerReserveLiabilityDays: [1, 180],
    };
    for (const [field, [minimum, maximum]] of Object.entries(ranges)) {
        const value = payload[field];
        if (typeof value !== "number" || value < minimum || value > maximum) {
            throw new HttpError(400, `${field} must be an integer between ${minimum} and ${maximum}`);
        }
    }
    const nonNegativeFields = [
        "buyerFeeFixedAmount",
        "buyerFeeMinimumAmount",
        "buyerFeeMaximumAmount",
        "sellerFeeFixedAmount",
        "sellerFeeMinimumAmount",
        "sellerFeeMaximumAmount",
        "estimatedStripeCostAmount",
        "estimatedCarrierCostAmount",
        "platformRiskReserveContributionAmount",
        "configuredMinimumMarginAmount",
        "subsidyMaximumDeficitAmount",
        "financeReviewThresholdAmount",
        "dualApprovalThresholdAmount",
        "highValueReviewAmount",
    ];
    for (const field of nonNegativeFields) {
        const value = payload[field];
        if (value !== undefined && (typeof value !== "number" || value < 0)) {
            throw new HttpError(400, `${field} must be a non-negative integer`);
        }
    }
    for (const field of ["orderTransferLimitAmount", "velocityLimitAmount"]) {
        const value = payload[field];
        if (typeof value !== "number" || value < 1) {
            throw new HttpError(400, `${field} must be a positive integer`);
        }
    }
    for (const prefix of ["buyerFee", "sellerFee"]) {
        const fixed = payload[`${prefix}FixedAmount`];
        const minimum = payload[`${prefix}MinimumAmount`];
        const maximum = payload[`${prefix}MaximumAmount`];
        if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) {
            throw new HttpError(400, `${prefix}MinimumAmount cannot exceed ${prefix}MaximumAmount`);
        }
        if (typeof fixed === "number" && typeof maximum === "number" && fixed > maximum) {
            throw new HttpError(400, `${prefix}FixedAmount cannot exceed ${prefix}MaximumAmount`);
        }
    }
}
