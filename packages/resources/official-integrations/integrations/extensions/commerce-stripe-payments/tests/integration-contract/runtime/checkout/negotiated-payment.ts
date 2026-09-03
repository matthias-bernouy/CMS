import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

const agreementId = "11111111-1111-4111-8111-111111111111";
const listingAmount = 11_000;
const agreedAmount = 12_000;
const acceptedLegalDocumentVersionId = "018f72b8-1f90-7c31-a933-592c90c8178a";
const paymentInput = {
    orderId: 84,
    acceptedLegalDocumentVersionIds: [acceptedLegalDocumentVersionId],
};
const preparedPaymentInput = { ...paymentInput, paymentProvider: "stripe" };

export async function assertNegotiatedPaymentCreation(
    { fn, protectedOrderFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const orderInput = { agreementId, idempotencyKey: "negotiated-checkout-84" };
    const orderResponse = await executeFunction(protectedOrderFn, jsonRequest("createProtectedOrder", orderInput), {
        sources,
        identities,
        user: { id: "negotiated-buyer", role: "user" },
        deps: {
            identities,
            fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/protected-checkout/seller-context")) {
                    expect(await request.json()).toEqual({ agreementId });
                    return sellerContext();
                }
                if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                    return Response.json({ eligible: true, reasonCode: "eligible" });
                }
                if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                    return saleCapability();
                }
                if (request.url.startsWith("https://commerce.test/order/create")) {
                    expect(await request.json()).toEqual(orderInput);
                    return Response.json(
                        {
                            id: 84,
                            publicId: "order-public-84",
                            status: "awaiting_quote",
                            currency: "eur",
                            subtotalAmount: agreedAmount,
                            totalAmount: agreedAmount,
                        },
                        { status: 201 },
                    );
                }
                throw new Error(`unexpected negotiated order call: ${request.url}`);
            },
        },
    });
    expect(orderResponse.status).toBe(200);
    expect(await orderResponse.json()).toMatchObject({
        id: 84,
        subtotalAmount: agreedAmount,
        totalAmount: agreedAmount,
    });

    let stripePaymentBody: Record<string, unknown> | undefined;
    let recordedPaymentBody: Record<string, unknown> | undefined;
    const paymentResponse = await executeFunction(fn, jsonRequest("createPaymentForOrder", paymentInput), {
        sources,
        identities,
        user: { id: "negotiated-buyer", role: "user" },
        deps: {
            identities,
            fetchImpl: async (input, init) => {
                const request = new Request(input, init);
                if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                    expect(await request.json()).toEqual({ orderId: 84 });
                    return sellerContext();
                }
                if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                    expect(await request.json()).toEqual({ sellerUserId: "seller-subject" });
                    return Response.json({ eligible: true, reasonCode: "eligible" });
                }
                if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                    return saleCapability();
                }
                if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                    expect(await request.json()).toEqual(preparedPaymentInput);
                    return Response.json(negotiatedFinancialTerms());
                }
                if (request.url.startsWith("https://stripe.test/payout/platform")) {
                    expect(await request.json()).toMatchObject({ minimumBalanceEur: 10_800 });
                    return Response.json({
                        liabilityRevision: 8,
                        appliedMinimumBalanceEur: 10_800,
                        decreaseAuthorizationId: null,
                        payoutControl: { interval: "manual" },
                    });
                }
                if (request.url.startsWith("https://commerce.test/recordPlatformPayoutLiabilityApplied")) {
                    return Response.json({ accepted: true, needsReapply: false });
                }
                if (request.url.startsWith("https://commerce.test/payment/record")) {
                    recordedPaymentBody = (await request.json()) as Record<string, unknown>;
                    return Response.json({ paymentStatus: "requires_action", settlementStatus: "held" });
                }
                if (request.url.startsWith("https://stripe.test/payout/seller")) {
                    throw new Error("seller payout controls must not block negotiated checkout");
                }
                stripePaymentBody = (await request.json()) as Record<string, unknown>;
                return Response.json({
                    paymentId: 84,
                    stripePaymentIntentId: "pi_negotiated_84",
                    clientSecret: "pi_negotiated_84_secret",
                    clientReferenceId: "order-public-84",
                    paymentStatus: "requires_action",
                    commercePaymentStatus: "requires_action",
                    settlementStatus: "held",
                    disputeStatus: "none",
                    refundedAmount: 0,
                    transferredAmount: 0,
                    reversedAmount: 0,
                    sellerTransferAmount: 10_800,
                    platformRetainedAmount: 1_200,
                    amountTotal: agreedAmount,
                    currency: "EUR",
                    financialTermsHash: "negotiated_terms_hash_84",
                    updatedAt: "2026-07-23T14:00:00.000Z",
                });
            },
        },
    });

    expect(paymentResponse.status).toBe(200);
    expect(await paymentResponse.json()).toMatchObject({
        paymentId: 84,
        amountTotal: agreedAmount,
        buyerTotalAmount: agreedAmount,
        financialTermsHash: "negotiated_terms_hash_84",
    });
    expect(stripePaymentBody).toMatchObject({
        amountTotal: agreedAmount,
        sellerTransferAmount: 10_800,
        clientReferenceId: "order-public-84",
        financialTermsHash: "negotiated_terms_hash_84",
    });
    expect(recordedPaymentBody).toMatchObject({
        amount: agreedAmount,
        financialTermsHash: "negotiated_terms_hash_84",
        providerSnapshot: expect.objectContaining({
            amountTotal: agreedAmount,
            sellerTransferAmount: 10_800,
        }),
    });
    expect(JSON.stringify({ stripePaymentBody, recordedPaymentBody })).not.toContain(String(listingAmount));
}

function negotiatedFinancialTerms() {
    return {
        orderId: 84,
        orderPublicId: "order-public-84",
        orderNumber: "ORDER-84",
        sellerId: "seller-subject",
        buyerTotalAmount: agreedAmount,
        sellerProceedsAmount: 10_800,
        sellerTransferReleaseAmount: 9_800,
        sellerReserveLiabilityAmount: 1_000,
        currency: "EUR",
        financialTermsHash: "negotiated_terms_hash_84",
        financialRevision: 4,
        protectionRequired: true,
        payoutDelayDays: 14,
        dualApprovalThresholdAmount: 1_000,
        sellerRequiredMinimumBalanceAmount: 0,
        platformRequiredMinimumBalanceAmount: 10_800,
        platformLiabilityRevision: 8,
        platformPayoutDecreaseAuthorizationId: null,
        platformPayoutChangeDirection: "increase",
        sellerReserveLiabilityDays: 30,
    };
}

function sellerContext(): Response {
    return Response.json({
        sellerCmsUserId: "seller-subject",
        buyerCmsUserId: "negotiated-buyer",
    });
}

function saleCapability(): Response {
    return Response.json({
        sellerId: 17,
        capabilityKey: "protected_payment",
        ready: true,
        confirmedAt: "2026-07-23T12:00:00.000Z",
        revokedAt: null,
    });
}

function jsonRequest(functionName: string, body: unknown): Request {
    return new Request(`https://cms.test/functions/${functionName}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
