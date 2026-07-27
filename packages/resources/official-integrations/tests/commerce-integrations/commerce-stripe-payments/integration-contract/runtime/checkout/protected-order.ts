import { expect } from "bun:test";
import type { InMemoryIdentityService } from "@bernouy/cms-identities";
import { executeFunction } from "@bernouy/cms-functions";
import type { IntegrationContractContext } from "../../harness";

export async function assertProtectedOrderCreation(
    { fn, protectedOrderFn, sources }: IntegrationContractContext,
    identities: InMemoryIdentityService,
): Promise<void> {
    const orderInput = {
        idempotencyKey: "protected-checkout-42",
        items: [{ offerId: "91", quantity: 1 }],
        shippingAddress: { city: "Paris" },
        billingAddress: { city: "Paris" },
    };
    const protectedOrderResponse = await executeFunction(
        protectedOrderFn,
        new Request("https://cms.test/functions/createProtectedOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(orderInput),
        }),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-checkout/seller-context")) {
                        expect(await request.json()).toEqual({ items: orderInput.items });
                        return Response.json({
                            sellerCmsUserId: "seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: true, reasonCode: "eligible" });
                    }
                    if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        return saleCapabilityResponse(true);
                    }
                    if (request.url.startsWith("https://commerce.test/order/create")) {
                        expect(await request.json()).toEqual(orderInput);
                        return Response.json(
                            {
                                id: 42,
                                publicId: "order-public-42",
                                status: "awaiting_quote",
                                currency: "eur",
                                subtotalAmount: 2000,
                                totalAmount: 2000,
                            },
                            { status: 201 },
                        );
                    }
                    throw new Error(`unexpected protected-order call: ${request.url}`);
                },
            },
        },
    );
    expect(protectedOrderResponse.status).toBe(200);
    expect(await protectedOrderResponse.json()).toEqual({
        id: 42,
        publicId: "order-public-42",
        status: "awaiting_quote",
        currency: "eur",
        subtotalAmount: 2000,
        totalAmount: 2000,
    });

    let reservationAttempted = false;
    const blockedOrderResponse = await executeFunction(
        protectedOrderFn,
        new Request("https://cms.test/functions/createProtectedOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(orderInput),
        }),
        {
            sources,
            identities,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                identities,
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test/protected-checkout/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "legacy-seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: false, reasonCode: "seller_terms_not_current" });
                    }
                    if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        return saleCapabilityResponse(false);
                    }
                    reservationAttempted = true;
                    throw new Error(`unexpected mutation after failed eligibility: ${request.url}`);
                },
            },
        },
    );
    expect(blockedOrderResponse.status).toBe(409);
    expect(await blockedOrderResponse.json()).toEqual({ error: "SELLER_PROTECTED_PAYMENT_NOT_READY" });
    expect(reservationAttempted).toBeFalse();

    let paymentPreparationAttempted = false;
    let providerPaymentAttempted = false;
    const blockedPaymentResponse = await executeFunction(
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
                    if (request.url.startsWith("https://commerce.test/payment/prepare")) {
                        paymentPreparationAttempted = true;
                        expect(await request.json()).toEqual({ orderId: 42, paymentProvider: "stripe" });
                        return Response.json({
                            protectionRequired: true,
                            currency: "EUR",
                            buyerTotalAmount: 2_000,
                        });
                    }
                    if (request.url.startsWith("https://commerce.test/protected-payment/seller-context")) {
                        return Response.json({
                            sellerCmsUserId: "legacy-seller-subject",
                            buyerCmsUserId: "buyer-subject",
                        });
                    }
                    if (request.url.startsWith("https://stripe.test/seller-eligibility")) {
                        return Response.json({ eligible: false, reasonCode: "seller_terms_not_current" });
                    }
                    if (request.url.startsWith("https://commerce.test/seller/sale-capability")) {
                        return saleCapabilityResponse(false);
                    }
                    providerPaymentAttempted = true;
                    throw new Error(`unexpected payment mutation after failed eligibility: ${request.url}`);
                },
            },
        },
    );
    expect(blockedPaymentResponse.status).toBe(409);
    expect(await blockedPaymentResponse.json()).toEqual({ error: "SELLER_PROTECTED_PAYMENT_NOT_READY" });
    expect(paymentPreparationAttempted).toBeTrue();
    expect(providerPaymentAttempted).toBeFalse();
}

function saleCapabilityResponse(ready: boolean): Response {
    return Response.json({
        sellerId: 17,
        capabilityKey: "protected_payment",
        ready,
        confirmedAt: ready ? "2026-07-23T12:00:00.000Z" : null,
        revokedAt: ready ? null : "2026-07-23T12:00:00.000Z",
    });
}
