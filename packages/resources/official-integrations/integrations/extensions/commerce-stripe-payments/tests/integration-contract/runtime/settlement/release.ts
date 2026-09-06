import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertSettlementRelease(
    { releaseFn, sources, sellerPayoutSchedule }: IntegrationContractContext,
    identities: InMemoryIdentityService,
    initialSellerPayoutBody: unknown,
): Promise<void> {
    let sellerPayoutBody = initialSellerPayoutBody;
    let releaseBody: unknown;
    let releaseProjectionBody: unknown;
    const releaseCalls: string[] = [];
    const releaseResponse = await executeFunction(
        releaseFn,
        new Request("https://cms.test/functions/executeAuthorizedSettlementRelease", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "authorized",
                releaseAuthorizationId: "release-42",
                orderId: 42,
                orderPublicId: "order-public-42",
                paymentId: 9,
                businessKey: "settlement:9:release-42",
                releaseKind: "initial",
                sellerId: "seller-subject",
                sellerRequiredMinimumBalanceAmount: 0,
                payoutDelayDays: 14,
                amount: 2050,
                currency: "EUR",
                financialTermsHash: "terms_hash_42",
            }),
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
                    releaseCalls.push(new URL(request.url).pathname);
                    if (request.url.startsWith("https://stripe.test/payout/seller")) {
                        sellerPayoutBody = await request.json();
                        return Response.json({ payoutControl: { interval: "daily" } });
                    }
                    if (request.url.startsWith("https://stripe.test/settlement/release")) {
                        releaseBody = await request.json();
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
                    if (request.url.startsWith("https://commerce.test/settlement/record")) {
                        releaseProjectionBody = await request.json();
                        return Response.json({ settlementStatus: "released" });
                    }
                    throw new Error(`unexpected release call: ${request.url}`);
                },
            },
        },
    );
    expect(releaseResponse.status).toBe(200);
    expect(sellerPayoutBody).toEqual({
        userId: "seller-subject",
        payoutScheduleChangeId: `settlement-release:release-42:0:14:${sellerPayoutSchedule}`,
        payoutSchedule: sellerPayoutSchedule,
        minimumBalanceEur: 0,
        delayDaysOverride: 14,
        reason: "Commerce authorized settlement release",
    });
    expect(releaseCalls).toEqual(["/payout/seller", "/settlement/release", "/settlement/record"]);
    expect(releaseBody).toEqual({
        paymentId: 9,
        releaseAuthorizationId: "release-42",
        releaseKind: "initial",
        amount: 2050,
        currency: "EUR",
    });
    expect(releaseProjectionBody).toMatchObject({
        orderPublicId: "order-public-42",
        providerEventId: "transfer:71:2026-07-13T00:02:00.000Z",
        operationType: "transfer",
        providerOperationId: 71,
        status: "succeeded",
        amount: 2050,
        releaseAuthorizationId: "release-42",
    });

    let blockedTransferCalled = false;
    const blockedReleaseResponse = await executeFunction(
        releaseFn,
        new Request("https://cms.test/functions/executeAuthorizedSettlementRelease", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "authorized",
                releaseAuthorizationId: "release-43",
                orderId: 43,
                orderPublicId: "order-public-43",
                paymentId: 10,
                businessKey: "settlement:10:release-43",
                releaseKind: "initial",
                sellerId: "seller-subject",
                sellerRequiredMinimumBalanceAmount: 0,
                payoutDelayDays: 14,
                amount: 1800,
                currency: "EUR",
                financialTermsHash: "terms_hash_43",
            }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async (input) => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://stripe.test/payout/seller")) {
                        return Response.json(
                            { error: "seller payout controls are not currently applicable" },
                            { status: 409 },
                        );
                    }
                    if (request.url.startsWith("https://stripe.test/settlement/release")) {
                        blockedTransferCalled = true;
                    }
                    throw new Error(`unexpected blocked release call: ${request.url}`);
                },
            },
        },
    );
    expect(blockedReleaseResponse.status).toBe(502);
    expect(blockedTransferCalled).toBe(false);
}
