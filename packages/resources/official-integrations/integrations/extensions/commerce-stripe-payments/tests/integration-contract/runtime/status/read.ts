import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertPaymentReads(
    { statusFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const existingPaymentStatus = await executeFunction(
        statusFn,
        new Request("https://cms.test/functions/getPaymentForOrder?orderId=42"),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input) => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    return Response.json({
                        exists: true,
                        payment: {
                            paymentId: 9,
                            paymentStatus: "succeeded",
                            commercePaymentStatus: "succeeded",
                            settlementStatus: "held",
                            disputeStatus: "none",
                            reconciliationPending: false,
                            refundedAmount: 0,
                            amountTotal: 2500,
                            currency: "EUR",
                            financialTermsHash: "terms_hash_42",
                            stripePaymentIntentId: "pi_9",
                            stripeChargeId: "ch_9",
                            buyerUserId: "buyer-subject",
                            sellerUserId: "seller-subject",
                            platformRetainedAmount: 250,
                            actualPlatformMarginAfterStripeAmount: 175,
                            manualReviewReason: "internal-only reason",
                            updatedAt: "2026-07-13T00:01:00.000Z",
                        },
                    });
                },
            },
        },
    );
    expect(existingPaymentStatus.status).toBe(200);
    expect(await existingPaymentStatus.json()).toEqual({
        orderId: 42,
        orderPublicId: "order-public-42",
        paymentExists: true,
        payment: {
            paymentStatus: "succeeded",
            settlementStatus: "held",
            disputeStatus: "none",
            reconciliationPending: false,
            refundedAmount: 0,
            amountTotal: 2500,
            currency: "EUR",
        },
    });

    const missingPaymentStatus = await executeFunction(
        statusFn,
        new Request("https://cms.test/functions/getPaymentForOrder?orderId=42"),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input) => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    expect(new URL(request.url).searchParams.get("clientReferenceId")).toBe("order-public-42");
                    return Response.json({ exists: false });
                },
            },
        },
    );
    expect(missingPaymentStatus.status).toBe(200);
    expect(await missingPaymentStatus.json()).toEqual({
        orderId: 42,
        orderPublicId: "order-public-42",
        paymentExists: false,
    });
}
