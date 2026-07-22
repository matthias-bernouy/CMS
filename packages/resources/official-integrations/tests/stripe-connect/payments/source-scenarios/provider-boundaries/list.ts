import { expect } from "bun:test";
import { financialTermsHash } from "../../../runtime/constants";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { jsonBody } from "../../../runtime/http";
import { sourceRequestWithRole } from "../../../runtime/source-requests";
import type { JsonRecord } from "../../../runtime/types";

export async function verifyProviderListBoundary(
    harness: StripeConnectHarness,
    created: JsonRecord,
    transferGroup: string,
): Promise<void> {
    harness.rest.clearStripeRequests();
    const listedResponse = await sourceRequestWithRole(harness, "admin-1", "admin", "listProviderPayments", {
        q: "provider-boundary",
        limit: "20",
    });
    expect(listedResponse.status).toBe(200);
    const listedBody = await jsonBody(listedResponse);
    expect(listedBody).toEqual({
        payments: [
            {
                paymentId: 1,
                providerPaymentId: 1,
                clientReferenceId: "provider-boundary-order",
                financialTermsHash,
                financialRevision: 1,
                buyerUserId: "user-123",
                sellerUserId: "seller-1",
                stripePaymentIntentId: "pi_1",
                stripeChargeId: null,
                providerEventId: null,
                transferGroup,
                currency: "eur",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                platformRetainedAmount: 120,
                refundedAmount: 0,
                transferredAmount: 0,
                reversedAmount: 0,
                stripeChargeBalanceTransactionId: null,
                actualStripeChargeFeeAmount: 0,
                actualStripeRefundFeeAmount: 0,
                actualStripeProcessingFeeAmount: 0,
                actualStripeChargeNetAmount: null,
                actualStripeFeeCurrency: null,
                actualStripeChargeFeeDetails: [],
                actualPlatformMarginAfterStripeAmount: 120,
                paymentStatus: "created",
                settlementStatus: "held",
                disputeStatus: "none",
                manualReviewReason: null,
                description: null,
                paidAt: null,
                cancelledAt: null,
                lastProviderSyncAt: created.lastProviderSyncAt,
                occurredAt: "2026-07-06T12:10:00.000Z",
                createdAt: "2026-07-06T12:05:00.000Z",
                updatedAt: "2026-07-06T12:10:00.000Z",
            },
        ],
        total: 1,
    });
    expect(harness.rest.stripeRequests).toEqual([]);
}
