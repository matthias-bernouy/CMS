import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertPaymentRefresh(
    { refreshFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let refreshedPaymentBody: unknown;
    const paymentStatusResponse = await executeFunction(
        refreshFn,
        new Request("https://cms.test/functions/refreshPaymentForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: 42 }),
        }),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        refreshedPaymentBody = await request.json();
                        return Response.json({ paymentStatus: "succeeded", settlementStatus: "held" });
                    }
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    expect(new URL(request.url).searchParams.get("clientReferenceId")).toBe("order-public-42");
                    return Response.json({
                        exists: true,
                        payment: {
                            paymentId: 9,
                            paymentStatus: "succeeded",
                            commercePaymentStatus: "manual_review",
                            settlementStatus: "manual_review",
                            disputeStatus: "none",
                            reconciliationPending: true,
                            refundedAmount: 0,
                            manualReviewReason: "Provider truth is awaiting reconciliation",
                            amountTotal: 2500,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            stripePaymentIntentId: "pi_9",
                            stripeChargeId: "ch_9",
                            buyerUserId: "buyer-subject",
                            sellerUserId: "seller-subject",
                            platformRetainedAmount: 250,
                            actualPlatformMarginAfterStripeAmount: 175,
                            updatedAt: "2026-07-13T00:01:00.000Z",
                        },
                    });
                },
            },
        },
    );
    expect(paymentStatusResponse.status).toBe(200);
    expect(await paymentStatusResponse.json()).toEqual({
        orderId: 42,
        orderPublicId: "order-public-42",
        payment: {
            paymentStatus: "succeeded",
            settlementStatus: "manual_review",
            disputeStatus: "none",
            reconciliationPending: true,
            refundedAmount: 0,
            amountTotal: 2500,
            currency: "EUR",
        },
    });
    expect(refreshedPaymentBody).toMatchObject({
        orderPublicId: "order-public-42",
        providerEventId: "payment-sync:9:2026-07-13T00:01:00.000Z",
        providerPaymentId: 9,
        status: "manual_review",
        providerChargeId: "ch_9",
        providerPaymentIntentId: "pi_9",
        providerSnapshot: {
            buyerUserId: "buyer-subject",
            sellerUserId: "seller-subject",
            financialTermsHash: "terms_hash_42",
            platformRetainedAmount: 250,
        },
    });
}
