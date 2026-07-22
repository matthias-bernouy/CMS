import { expect } from "bun:test";
import { financialTermsHash, functionsBaseUrl, isoTimestampPattern } from "../../../runtime/constants";
import { activeEnv } from "../../../runtime/environment";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { jsonBody } from "../../../runtime/http";
import type { JsonRecord } from "../../../runtime/types";

export async function verifyProviderDetailBoundary(
    harness: StripeConnectHarness,
    created: JsonRecord,
    transferGroup: string,
): Promise<void> {
    harness.rest.setPaymentIntentSucceeded("pi_1");
    const adminHeaders = {
        authorization: `Bearer ${activeEnv.CMS_STRIPE_CONNECT_API_KEY}`,
        "x-cms-user-id": "admin-1",
        "x-cms-user-role": "admin",
    };
    const detailResponse = await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments/payment?paymentId=1`, {
            headers: adminHeaders,
        }),
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = await jsonBody(detailResponse);
    expect(detailBody.paidAt).toEqual(expect.stringMatching(isoTimestampPattern));
    expect(detailBody.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
    expect(detailBody).toEqual({
        paymentId: 1,
        providerPaymentId: 1,
        clientReferenceId: "provider-boundary-order",
        financialTermsHash,
        financialRevision: 1,
        dualApprovalThresholdAmount: 1000,
        buyerUserId: "user-123",
        sellerUserId: "seller-1",
        stripePaymentIntentId: "pi_1",
        stripeChargeId: "ch_1",
        stripeChargeBalanceTransactionId: "txn_charge_1",
        providerEventId: null,
        transferGroup,
        currency: "eur",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        platformRetainedAmount: 120,
        refundedAmount: 0,
        transferredAmount: 0,
        reversedAmount: 0,
        actualStripeChargeFeeAmount: 65,
        actualStripeRefundFeeAmount: 0,
        actualStripeProcessingFeeAmount: 65,
        actualStripeChargeNetAmount: 1135,
        actualStripeFeeCurrency: "eur",
        actualStripeChargeFeeDetails: [{ type: "stripe_fee", amount: 65, currency: "eur" }],
        actualPlatformMarginAfterStripeAmount: 55,
        paymentStatus: "succeeded",
        commercePaymentStatus: "succeeded",
        settlementStatus: "held",
        disputeStatus: "none",
        reconciliationPending: false,
        manualReviewReason: null,
        description: null,
        paidAt: detailBody.paidAt,
        cancelledAt: null,
        lastProviderSyncAt: detailBody.lastProviderSyncAt,
        occurredAt: "2026-07-06T12:10:00.000Z",
        createdAt: "2026-07-06T12:05:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
    });
    expect(harness.rest.stripeRequests).toEqual([
        {
            method: "GET",
            pathname: "/v1/payment_intents/pi_1",
            searchParams: [["expand[]", "latest_charge.balance_transaction"]],
            idempotencyKey: null,
            stripeAccount: null,
        },
    ]);

    harness.rest.clearStripeRequests();
    const missingResponse = await harness.edgeRequest(
        new Request(`${functionsBaseUrl}/cms-stripe-connect/admin/payments/payment?paymentId=999`, {
            headers: adminHeaders,
        }),
    );
    expect(missingResponse.status).toBe(404);
    expect(await jsonBody(missingResponse)).toEqual({ error: "payment not found" });
    expect(harness.rest.stripeRequests).toEqual([]);
}
