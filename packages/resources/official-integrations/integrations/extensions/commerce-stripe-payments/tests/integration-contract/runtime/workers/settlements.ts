import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertSettlementWorker(
    { releaseWorker, sources, sellerPayoutSchedule }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const releaseWorkerCalls: string[] = [];
    const releaseWorkerPayoutBodies: unknown[] = [];
    const releaseWorkerResponse = await executeFunction(
        releaseWorker,
        new Request("https://cms.test/functions/dispatchDueProtectedSettlements", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runKey: "release-run-1", limit: 10 }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url === "https://stripe.test/configuration") {
                        return Response.json({ sellerPayoutSchedule });
                    }
                    releaseWorkerCalls.push(new URL(request.url).pathname);
                    if (request.url.includes("authorizeDueOrderReleases")) {
                        return Response.json({
                            runKey: "release-run-1",
                            authorizations: [
                                {
                                    status: "authorized",
                                    releaseAuthorizationId: "release-42",
                                    orderId: 42,
                                    orderPublicId: "order-public-42",
                                    paymentId: 9,
                                    businessKey: "settlement:9:release-42",
                                    releaseKind: "initial",
                                    sellerId: "seller-subject",
                                    sellerRequiredMinimumBalanceAmount: 0,
                                    payoutDelayDays: 0,
                                    amount: 2050,
                                    currency: "EUR",
                                    financialTermsHash: "terms_hash_42",
                                },
                            ],
                        });
                    }
                    if (request.url.includes("/payout/seller")) {
                        releaseWorkerPayoutBodies.push(await request.json());
                        return Response.json({ payoutControl: { interval: "daily" } });
                    }
                    if (request.url.includes("/settlement/release")) {
                        return Response.json({
                            providerOperationId: 71,
                            paymentId: 9,
                            releaseAuthorizationId: "release-42",
                            amount: 2050,
                            currency: "EUR",
                            status: "succeeded",
                            occurredAt: "2026-07-13T00:02:00.000Z",
                            updatedAt: "2026-07-13T00:02:00.000Z",
                        });
                    }
                    if (request.url.includes("/settlement/record")) {
                        return Response.json({ status: "released" });
                    }
                    throw new Error(`unexpected release worker call: ${request.url}`);
                },
            },
        },
    );
    expect(releaseWorkerResponse.status).toBe(200);
    expect(releaseWorkerCalls).toEqual([
        "/authorizeDueOrderReleases",
        "/payout/seller",
        "/settlement/release",
        "/settlement/record",
    ]);
    expect(releaseWorkerPayoutBodies).toEqual([
        {
            userId: "seller-subject",
            payoutScheduleChangeId: `settlement-release:release-42:0:0:${sellerPayoutSchedule}`,
            payoutSchedule: sellerPayoutSchedule,
            minimumBalanceEur: 0,
            delayDaysOverride: 0,
            reason: "Commerce authorized settlement release",
        },
    ]);
}
