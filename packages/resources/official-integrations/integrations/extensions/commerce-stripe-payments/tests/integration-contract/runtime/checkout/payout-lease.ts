import { expect } from "bun:test";
import { executeFunction } from "@bernouy/cms-functions";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { IntegrationContractContext } from "../../harness";

export async function assertPlatformPayoutLeaseConflict(
    { fn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    let providerPaymentAttempted = false;
    let liabilityReceiptAttempted = false;
    const response = await executeFunction(
        fn,
        new Request("https://cms.test/functions/createPaymentForOrder", {
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
                    if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        return Response.json({
                            sellerId: 17,
                            capabilityKey: "protected_payment",
                            ready: true,
                            confirmedAt: "2026-07-24T12:00:00.000Z",
                            revokedAt: null,
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                        return Response.json(preparedTerms());
                    }
                    if (request.url.startsWith("https://stripe.test/payout/platform")) {
                        return Response.json(
                            { error: "platform payout protection is already being synchronized" },
                            { status: 409 },
                        );
                    }
                    if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                        liabilityReceiptAttempted = true;
                    }
                    providerPaymentAttempted = true;
                    throw new Error(`unexpected mutation after payout lease conflict: ${request.url}`);
                },
            },
        },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
        error: "platform payout protection is already being synchronized",
    });
    expect(liabilityReceiptAttempted).toBeFalse();
    expect(providerPaymentAttempted).toBeFalse();
}

function preparedTerms() {
    return {
        orderId: 42,
        orderPublicId: "order-public-42",
        orderNumber: "ORDER-42",
        sellerId: "seller-subject",
        buyerTotalAmount: 2500,
        sellerProceedsAmount: 2250,
        sellerTransferReleaseAmount: 2050,
        sellerReserveLiabilityAmount: 200,
        currency: "EUR",
        financialTermsHash: "terms_hash_42",
        financialRevision: 3,
        protectionRequired: true,
        payoutDelayDays: 14,
        dualApprovalThresholdAmount: 1000,
        sellerRequiredMinimumBalanceAmount: 0,
        platformRequiredMinimumBalanceAmount: 2250,
        platformLiabilityRevision: 7,
        platformPayoutDecreaseAuthorizationId: null,
        platformPayoutChangeDirection: "increase",
        sellerReserveLiabilityDays: 30,
    };
}
