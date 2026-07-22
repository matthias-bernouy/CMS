import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertReconciliationWorker(
    { reconciliationWorker, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const reconciliationProjections: string[] = [];
    let reconciliationPaymentBody: unknown;
    let reconciliationOperationBody: unknown;
    let reconciliationDisputeBody: unknown;
    const reconciliationResponse = await executeFunction(
        reconciliationWorker,
        new Request("https://cms.test/functions/reconcileProtectedPaymentSystems", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runKey: "reconcile-run-1", limit: 5 }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.includes("pendingPlatformPayoutLiabilityAuthorizations")) {
                        return Response.json({
                            runKey: "reconcile-run-1",
                            control: { liabilityRevision: 7, requiredMinimumAmount: 2250 },
                            authorizations: [],
                        });
                    }
                    if (request.url.includes("/reconciliation/projections/ack")) {
                        return Response.json({ acknowledged: true });
                    }
                    if (request.url === "https://stripe.test/reconciliation") {
                        return Response.json({
                            runId: 1,
                            runKey: "reconcile-run-1",
                            status: "succeeded",
                            payments: [
                                {
                                    paymentId: 9,
                                    clientReferenceId: "order-public-42",
                                    paymentStatus: "succeeded",
                                    providerEventId: "payment-projection-101",
                                    stripePaymentIntentId: "pi_9",
                                    amountTotal: 2500,
                                    currency: "EUR",
                                    financialTermsHash: "terms_hash_42",
                                    occurredAt: "2026-07-13T00:04:00.000Z",
                                    stripeChargeId: "ch_9",
                                    updatedAt: "2026-07-13T00:04:00.000Z",
                                    projectionId: 101,
                                    projectionClaimToken: "claim-payment-101",
                                },
                            ],
                            commerceOperations: [
                                {
                                    orderPublicId: "order-public-42",
                                    providerOperationId: 82,
                                    operationType: "refund",
                                    providerEventId: "refund:82:succeeded",
                                    status: "succeeded",
                                    amount: 2500,
                                    currency: "EUR",
                                    occurredAt: "2026-07-13T00:04:00.000Z",
                                    updatedAt: "2026-07-13T00:04:00.000Z",
                                    releaseAuthorizationId: null,
                                    refundRequestId: "refund:42:1",
                                    commerceRefundRequestId: 1,
                                    providerSnapshot: { id: "re_82" },
                                    projectionId: 102,
                                    projectionClaimToken: "claim-operation-102",
                                },
                            ],
                            disputes: [
                                {
                                    id: "dp_1",
                                    clientReferenceId: "order-public-42",
                                    status: "needs_response",
                                    reason: "fraudulent",
                                    providerEventId: "dispute:31:evt_31:needs_response:withdrawn",
                                    amount: 2500,
                                    currency: "EUR",
                                    createdAt: "2026-07-12T00:00:00.000Z",
                                    updatedAt: "2026-07-13T00:04:00.000Z",
                                    evidenceDueBy: "2026-07-20T00:00:00.000Z",
                                    projectionId: 103,
                                    projectionClaimToken: "claim-dispute-103",
                                },
                            ],
                        });
                    }
                    reconciliationProjections.push(new URL(request.url).pathname);
                    if (new URL(request.url).pathname === "/payment/record") {
                        reconciliationPaymentBody = await request.json();
                    }
                    if (new URL(request.url).pathname === "/settlement/record") {
                        reconciliationOperationBody = await request.json();
                    }
                    if (new URL(request.url).pathname === "/recordOrderStripeDispute") {
                        reconciliationDisputeBody = await request.json();
                    }
                    return Response.json({ idempotentReplay: false });
                },
            },
        },
    );
    expect(reconciliationResponse.status).toBe(200);
    expect(reconciliationProjections).toEqual(["/payment/record", "/settlement/record", "/recordOrderStripeDispute"]);
    expect(reconciliationPaymentBody).toMatchObject({
        providerEventId: "payment-projection-101",
        providerPaymentId: 9,
    });
    expect(reconciliationOperationBody).toMatchObject({
        providerEventId: "refund:82:succeeded",
        providerOperationId: 82,
    });
    expect(reconciliationDisputeBody).toMatchObject({
        providerEventId: "dispute:31:evt_31:needs_response:withdrawn",
        providerDisputeId: "dp_1",
    });
}
