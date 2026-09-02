import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertRefundWorker(
    { refundWorker, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let retriedRefundBody: unknown;
    const refundWorkerResponse = await executeFunction(
        refundWorker,
        new Request("https://cms.test/functions/dispatchPendingProtectedRefunds", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runKey: "refund-run-1", limit: 10 }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.includes("pendingOrderRefundAuthorizations")) {
                        return Response.json({
                            runKey: "refund-run-1",
                            authorizations: [
                                {
                                    status: "processing",
                                    orderId: 42,
                                    orderPublicId: "order-public-42",
                                    providerPaymentId: 9,
                                    refundRequestId: "refund:42:1",
                                    commerceRefundRequestId: 1,
                                    businessKey: "refund:42:1",
                                    amount: 2500,
                                    authorizedSellerAmount: 0,
                                    sellerEntitlementReductionAmount: 2050,
                                    sellerRecoveryAmount: 2050,
                                    protectionFeeRefundAmount: 100,
                                    currency: "EUR",
                                    financialTermsHash: "terms_hash_42",
                                    requiresFinanceApproval: true,
                                },
                            ],
                        });
                    }
                    if (request.url.includes("/refund/protected")) {
                        retriedRefundBody = await request.json();
                        return Response.json({
                            payment: { paymentId: 9 },
                            reversal: null,
                            refund: {},
                            operations: [],
                        });
                    }
                    throw new Error(`unexpected refund worker call: ${request.url}`);
                },
            },
        },
    );
    expect(refundWorkerResponse.status).toBe(200);
    expect(retriedRefundBody).toEqual({
        paymentId: 9,
        refundRequestId: "refund:42:1",
        commerceRefundRequestId: 1,
        amount: 2500,
        authorizedSellerAmount: 0,
        sellerEntitlementReductionAmount: 2050,
        reason: "Commerce authorized refund retry",
    });
}
