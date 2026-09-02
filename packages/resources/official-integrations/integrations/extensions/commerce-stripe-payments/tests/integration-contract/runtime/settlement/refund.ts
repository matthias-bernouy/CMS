import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertProtectedRefund(
    { refundFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let protectedRefundBody: unknown;
    const refundProjectionBodies: unknown[] = [];
    const refundResponse = await executeFunction(
        refundFn,
        new Request("https://cms.test/functions/executeAuthorizedRefund", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "approved",
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
                    if (request.url.startsWith("https://stripe.test/refund/protected")) {
                        protectedRefundBody = await request.json();
                        const operations = [
                            {
                                providerEventId: "reversal:81:succeeded",
                                providerOperationId: 81,
                                operationType: "reversal",
                                providerOperationObjectId: "trr_81",
                                status: "succeeded",
                                amount: 2050,
                                currency: "EUR",
                                occurredAt: "2026-07-13T00:03:00.000Z",
                                refundRequestId: "refund:42:1",
                                providerSnapshot: { stripeTransferReversalId: "trr_81" },
                            },
                            {
                                providerEventId: "refund:82:processing",
                                providerOperationId: 82,
                                operationType: "refund",
                                providerOperationObjectId: "re_82",
                                status: "processing",
                                amount: 2500,
                                currency: "EUR",
                                occurredAt: "2026-07-13T00:03:01.000Z",
                                refundRequestId: "refund:42:1",
                                providerSnapshot: { stripeRefundId: "re_82" },
                            },
                        ];
                        return Response.json({ payment: { paymentId: 9 }, reversal: {}, refund: {}, operations });
                    }
                    if (request.url.startsWith("https://commerce.test/settlement/record")) {
                        refundProjectionBodies.push(await request.json());
                        return Response.json({ settlementStatus: "blocked" });
                    }
                    throw new Error(`unexpected refund call: ${request.url}`);
                },
            },
        },
    );
    expect(refundResponse.status).toBe(200);
    expect(protectedRefundBody).toEqual({
        paymentId: 9,
        refundRequestId: "refund:42:1",
        commerceRefundRequestId: 1,
        amount: 2500,
        authorizedSellerAmount: 0,
        sellerEntitlementReductionAmount: 2050,
        reason: "Commerce authorized refund",
    });
    expect(refundProjectionBodies).toHaveLength(2);
    expect(refundProjectionBodies.map((body) => (body as Record<string, unknown>).operationType)).toEqual([
        "reversal",
        "refund",
    ]);
    expect(refundProjectionBodies[1]).toMatchObject({
        orderPublicId: "order-public-42",
        providerEventId: "provider-operation:82:processing:2026-07-13T00:03:01.000Z",
        providerOperationId: 82,
        status: "processing",
        amount: 2500,
        refundRequestId: "refund:42:1",
        commerceRefundRequestId: 1,
    });
    const unapprovedRefund = await executeFunction(
        refundFn,
        new Request("https://cms.test/functions/executeAuthorizedRefund", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                status: "requested",
                orderId: 42,
                orderPublicId: "order-public-42",
                providerPaymentId: 9,
                refundRequestId: "refund:42:2",
                commerceRefundRequestId: 2,
                businessKey: "refund:42:2",
                amount: 2500,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 2050,
                sellerRecoveryAmount: 2050,
                protectionFeeRefundAmount: 100,
                currency: "EUR",
                financialTermsHash: "terms_hash_42",
                requiresFinanceApproval: true,
            }),
        }),
        {
            sources,
            identities,
            user: { id: "system", role: "admin" },
            deps: {
                identities,
                fetchImpl: async () => {
                    throw new Error("provider must not be called for an unapproved refund");
                },
            },
        },
    );
    expect(unapprovedRefund.status).toBe(409);
    expect(await unapprovedRefund.json()).toEqual({ error: "Refund is not fully authorized" });
}
