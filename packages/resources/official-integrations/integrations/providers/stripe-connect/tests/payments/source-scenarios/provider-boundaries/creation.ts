import { expect } from "bun:test";
import { financialTermsHash, isoTimestampPattern } from "../../../runtime/constants";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { jsonBody, okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";

export async function createProviderBoundaryPayment(
    createHarness: () => Promise<StripeConnectHarness>,
): Promise<{ harness: StripeConnectHarness; created: Record<string, unknown>; transferGroup: string }> {
    const harness = await createHarness();
    await okJson(
        await sourceJson(
            harness,
            "createConnectOnboardingSessionForUser",
            {
                email: "seller@example.com",
            },
            { userId: "seller-1" },
        ),
    );

    harness.rest.clearStripeRequests();
    const creationResponse = await sourceJson(harness, "createProtectedPayment", {
        sellerUserId: "seller-1",
        amountTotal: 1200,
        sellerTransferAmount: 1080,
        currency: "eur",
        clientReferenceId: "provider-boundary-order",
        financialTermsHash,
        dualApprovalThresholdAmount: 1000,
    });
    expect(creationResponse.status).toBe(200);
    const created = await jsonBody(creationResponse);
    const transferGroup = "cms_order_068ccc3b0562834d11de0cd73aa06bcc945b494427cc05d88e974850a075ce15";
    expect(created.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
    expect(created).toEqual({
        paymentId: 1,
        providerPaymentId: 1,
        clientReferenceId: "provider-boundary-order",
        financialTermsHash,
        financialRevision: 1,
        dualApprovalThresholdAmount: 1000,
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
        commercePaymentStatus: "created",
        settlementStatus: "held",
        disputeStatus: "none",
        manualReviewReason: null,
        paidAt: null,
        cancelledAt: null,
        lastProviderSyncAt: created.lastProviderSyncAt,
        occurredAt: "2026-07-06T12:10:00.000Z",
        createdAt: "2026-07-06T12:05:00.000Z",
        updatedAt: "2026-07-06T12:10:00.000Z",
        clientSecret: "pi_1_secret",
    });
    expect(harness.rest.stripeRequests).toEqual([
        {
            method: "GET",
            pathname: "/v2/core/accounts/acct_seller_example_com",
            searchParams: [
                ["include[0]", "configuration.recipient"],
                ["include[1]", "defaults"],
                ["include[2]", "identity"],
                ["include[3]", "requirements"],
            ],
            idempotencyKey: null,
            stripeAccount: null,
        },
        {
            method: "GET",
            pathname: "/v1/balance_settings",
            searchParams: [],
            idempotencyKey: null,
            stripeAccount: null,
        },
        {
            method: "POST",
            pathname: "/v1/payment_intents",
            searchParams: [],
            idempotencyKey: `payment:1:${financialTermsHash}`,
            stripeAccount: null,
        },
    ]);
    return { harness, created, transferGroup };
}
