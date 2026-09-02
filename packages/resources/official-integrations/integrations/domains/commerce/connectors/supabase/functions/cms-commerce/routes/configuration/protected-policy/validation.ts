import { HttpError } from "../../../core/errors.ts";
import type { JsonRecord } from "../../../core/types.ts";

export function assertIntegerRanges(payload: JsonRecord): void {
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
    assertNonNegativeFields(payload);
    assertPositiveFields(payload);
    assertFeeRanges(payload);
}

function assertNonNegativeFields(payload: JsonRecord): void {
    const fields = [
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
    for (const field of fields) {
        const value = payload[field];
        if (value !== undefined && (typeof value !== "number" || value < 0)) {
            throw new HttpError(400, `${field} must be a non-negative integer`);
        }
    }
}

function assertPositiveFields(payload: JsonRecord): void {
    for (const field of ["orderTransferLimitAmount", "velocityLimitAmount"]) {
        const value = payload[field];
        if (typeof value !== "number" || value < 1) {
            throw new HttpError(400, `${field} must be a positive integer`);
        }
    }
}

function assertFeeRanges(payload: JsonRecord): void {
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
