import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

type JsonRecord = Record<string, unknown>;

export async function assertCancellationWorker(
    { cancellationWorker, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let cancellationPending = true;
    const cancellationProviderBodies: unknown[] = [];
    const cancellationProjectionBodies: unknown[] = [];
    const runCancellationTick = async (runKey: string) =>
        await executeFunction(
            cancellationWorker,
            new Request("https://cms.test/functions/dispatchPendingPaymentCancellations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ runKey, limit: 5 }),
            }),
            {
                sources,
                identities,
                user: { id: "system", role: "admin" },
                deps: {
                    identities,
                    fetchImpl: async (input, init) => {
                        const request = new Request(input, init);
                        if (request.url.includes("pendingPaymentCancellationAuthorizations")) {
                            return Response.json({
                                runKey,
                                authorizations: cancellationPending
                                    ? [
                                          {
                                              status: "processing",
                                              paymentCancellationRequestId: 31,
                                              cancellationRequestId: "payment-cancellation:deadline:42",
                                              orderId: 42,
                                              orderPublicId: "order-public-42",
                                              clientReferenceId: "order-public-42",
                                              targetOrderStatus: "expired",
                                              reason: "Payment deadline expired",
                                              amount: 2500,
                                              currency: "EUR",
                                              financialTermsHash: "terms_hash_42",
                                          },
                                      ]
                                    : [],
                            });
                        }
                        if (request.url === "https://stripe.test/payment/cancel") {
                            cancellationProviderBodies.push(await request.json());
                            const payment = {
                                paymentId: 9,
                                stripePaymentIntentId: "pi_9",
                                clientReferenceId: "order-public-42",
                                paymentStatus: "cancelled",
                                amountTotal: 2500,
                                currency: "EUR",
                                financialTermsHash: "terms_hash_42",
                                updatedAt: "2026-07-13T00:01:30.000Z",
                            };
                            return Response.json({
                                cancellationRequestId: "payment-cancellation:deadline:42",
                                providerOperationId: 91,
                                providerStatus: "canceled",
                                providerPaymentAbsent: false,
                                providerEventId: "payment-cancellation:91:2026-07-13T00:01:30.000Z",
                                providerPaymentId: 9,
                                providerPaymentIntentId: "pi_9",
                                paymentStatus: "cancelled",
                                amount: 2500,
                                currency: "EUR",
                                financialTermsHash: "terms_hash_42",
                                occurredAt: "2026-07-13T00:01:30.000Z",
                                providerSnapshot: payment,
                                payment,
                            });
                        }
                        if (request.url === "https://commerce.test/payment/record") {
                            cancellationProjectionBodies.push(await request.json());
                            cancellationPending = false;
                            return Response.json({ status: "cancelled", idempotentReplay: false });
                        }
                        throw new Error(`unexpected cancellation worker call: ${request.url}`);
                    },
                },
            },
        );

    expect((await runCancellationTick("payment-cancellation-recovery-1")).status).toBe(200);
    expect((await runCancellationTick("payment-cancellation-recovery-2")).status).toBe(200);
    expect(cancellationProviderBodies).toEqual([
        {
            clientReferenceId: "order-public-42",
            cancellationRequestId: "payment-cancellation:deadline:42",
            reason: "Payment deadline expired",
        },
    ]);
    expect(cancellationProjectionBodies).toEqual([
        expect.objectContaining({
            orderPublicId: "order-public-42",
            providerEventId: "payment-cancellation:91:2026-07-13T00:01:30.000Z",
            providerPaymentId: 9,
            providerPaymentIntentId: "pi_9",
            status: "cancelled",
            amount: 2500,
            financialTermsHash: "terms_hash_42",
        }),
    ]);

    let absentProjectionBody: JsonRecord | null = null;
    const absentCancellationTick = await executeFunction(
        cancellationWorker,
        new Request("https://cms.test/functions/dispatchPendingPaymentCancellations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runKey: "payment-cancellation-absent", limit: 1 }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.includes("pendingPaymentCancellationAuthorizations")) {
                        return Response.json({
                            runKey: "payment-cancellation-absent",
                            authorizations: [
                                {
                                    status: "requested",
                                    paymentCancellationRequestId: 32,
                                    cancellationRequestId: "payment-cancellation:deadline:43",
                                    orderId: 43,
                                    orderPublicId: "order-public-43",
                                    clientReferenceId: "order-public-43",
                                    targetOrderStatus: "expired",
                                    reason: "Payment deadline expired before provider creation",
                                    amount: 1500,
                                    currency: "EUR",
                                    financialTermsHash: "terms_hash_43",
                                },
                            ],
                        });
                    }
                    if (request.url === "https://stripe.test/payment/cancel") {
                        return Response.json({
                            cancellationRequestId: "payment-cancellation:deadline:43",
                            providerStatus: "absent",
                            providerPaymentAbsent: true,
                            providerEventId: "payment-cancellation-absent:payment-cancellation:deadline:43",
                            occurredAt: "2026-07-13T00:02:30.000Z",
                        });
                    }
                    if (request.url === "https://commerce.test/payment/record") {
                        absentProjectionBody = (await request.json()) as JsonRecord;
                        return Response.json({ status: "completed", providerPaymentAbsent: true });
                    }
                    throw new Error(`unexpected absent cancellation worker call: ${request.url}`);
                },
            },
        },
    );
    expect(absentCancellationTick.status).toBe(200);
    expect(absentProjectionBody as JsonRecord | null).toEqual({
        orderPublicId: "order-public-43",
        providerEventId: "payment-cancellation-absent:payment-cancellation:deadline:43",
        occurredAt: "2026-07-13T00:02:30.000Z",
        providerPaymentAbsent: true,
        cancellationRequestId: "payment-cancellation:deadline:43",
    });
}
