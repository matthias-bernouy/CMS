import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import { type IntegrationContractContext, SELLER_TERMS_HASH, SELLER_TERMS_VERSION } from "../../harness";

const acceptedLegalDocumentVersionId = "018f72b8-1f90-7c31-a933-592c90c8178a";
const paymentInput = {
    orderId: 42,
    acceptedLegalDocumentVersionIds: [acceptedLegalDocumentVersionId],
};
const preparedPaymentInput = { ...paymentInput, paymentProvider: "stripe" };

export async function assertPaymentCreation(
    { fn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
) {
    let paymentBody: unknown;
    let recordPaymentBody: unknown;
    let platformPayoutBody: unknown;
    let sellerPayoutBody: unknown;
    const response = await executeFunction(
        fn,
        new Request("https://cms.test/functions/createPaymentForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(paymentInput),
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
                        expect(await request.json()).toEqual({ orderId: 42 });
                        expect(request.headers.get("x-cms-user-id")).toBe("buyer-subject");
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        expect(await request.json()).toEqual({
                            sellerUserId: "seller-subject",
                            marketplaceTermsVersion: SELLER_TERMS_VERSION,
                            marketplaceTermsHash: SELLER_TERMS_HASH,
                        });
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        return Response.json({
                            sellerId: 17,
                            capabilityKey: "protected_payment",
                            ready: true,
                            confirmedAt: "2026-07-23T12:00:00.000Z",
                            revokedAt: null,
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                        expect(await request.json()).toEqual(preparedPaymentInput);
                        return Response.json({
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
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/payment/record")) {
                        recordPaymentBody = await request.json();
                        return Response.json({ paymentStatus: "requires_action", settlementStatus: "held" });
                    }
                    if (request.url.startsWith("https://stripe.test/payout/platform")) {
                        platformPayoutBody = await request.json();
                        return Response.json({
                            liabilityRevision: 7,
                            appliedMinimumBalanceEur: 2250,
                            decreaseAuthorizationId: null,
                            payoutControl: { interval: "manual" },
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                        return Response.json({ accepted: true, needsReapply: false });
                    }
                    if (request.url.startsWith("https://stripe.test/payout/seller")) {
                        throw new Error("seller payout controls must not block checkout");
                    }
                    paymentBody = await request.json();
                    expect(request.headers.get("x-user-id")).toBe("buyer-subject");
                    return Response.json({
                        paymentId: 9,
                        stripePaymentIntentId: "pi_9",
                        clientSecret: "pi_9_secret_test",
                        clientReferenceId: "order-public-42",
                        paymentStatus: "requires_action",
                        commercePaymentStatus: "requires_action",
                        settlementStatus: "held",
                        disputeStatus: "none",
                        refundedAmount: 0,
                        transferredAmount: 0,
                        reversedAmount: 0,
                        sellerTransferAmount: 2250,
                        platformRetainedAmount: 250,
                        amountTotal: 2500,
                        currency: "EUR",
                        financialTermsHash: "terms_hash_42",
                        updatedAt: "2026-07-13T00:00:00.000Z",
                    });
                },
            },
        },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        paymentId: 9,
        stripePaymentIntentId: "pi_9",
        status: "requires_action",
        paymentStatus: "requires_action",
        commercePaymentStatus: "requires_action",
        settlementStatus: "held",
        disputeStatus: "none",
        refundedAmount: 0,
        clientSecret: "pi_9_secret_test",
        amountTotal: 2500,
        buyerTotalAmount: 2500,
        currency: "EUR",
        financialTermsHash: "terms_hash_42",
    });
    expect(paymentBody).toEqual({
        sellerUserId: "seller-subject",
        amountTotal: 2500,
        sellerTransferAmount: 2250,
        currency: "EUR",
        clientReferenceId: "order-public-42",
        financialTermsHash: "terms_hash_42",
        financialRevision: 3,
        dualApprovalThresholdAmount: 1000,
        description: "ORDER-42",
    });
    expect(platformPayoutBody).toEqual({
        platformPayoutControlChangeId: "commerce-payment:terms_hash_42",
        minimumBalanceEur: 2250,
        liabilityRevision: 7,
        decreaseAuthorizationId: null,
        delayDaysOverride: 14,
        reason: "Commerce protected seller liabilities",
    });
    expect(sellerPayoutBody).toBeUndefined();
    expect(recordPaymentBody).toEqual({
        orderPublicId: "order-public-42",
        providerEventId: "payment-checkout-sync:9:2026-07-13T00:00:00.000Z",
        providerPaymentId: 9,
        providerPaymentIntentId: "pi_9",
        status: "requires_action",
        amount: 2500,
        currency: "EUR",
        financialTermsHash: "terms_hash_42",
        occurredAt: "2026-07-13T00:00:00.000Z",
        providerSnapshot: {
            paymentId: 9,
            stripePaymentIntentId: "pi_9",
            clientReferenceId: "order-public-42",
            paymentStatus: "requires_action",
            commercePaymentStatus: "requires_action",
            settlementStatus: "held",
            disputeStatus: "none",
            refundedAmount: 0,
            transferredAmount: 0,
            reversedAmount: 0,
            amountTotal: 2500,
            sellerTransferAmount: 2250,
            platformRetainedAmount: 250,
            currency: "EUR",
            financialTermsHash: "terms_hash_42",
            updatedAt: "2026-07-13T00:00:00.000Z",
        },
    });
    return { paymentBody, recordPaymentBody, sellerPayoutBody };
}
