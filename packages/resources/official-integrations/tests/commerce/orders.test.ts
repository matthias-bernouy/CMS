import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "./harness";

installCommerceTestEnvironment();

describe("commerce order requests", () => {
    test("resolves protected-checkout seller identities without creating or mutating an order", async () => {
        const requestedPaths: string[] = [];
        setRestResponder(request => {
            const url = new URL(request.url);
            requestedPaths.push(`${url.pathname}?${url.searchParams.toString()}`);
            if (url.pathname.endsWith("/offers")) {
                expect(url.searchParams.get("id")).toBe("in.(91)");
                return jsonResponse([{ id: 91, seller_id: 7 }]);
            }
            if (url.pathname.endsWith("/orders")) {
                expect(url.searchParams.get("id")).toBe("eq.42");
                return jsonResponse([{ id: 42, seller_id: 7, buyer_cms_user_id: "buyer-user-456" }]);
            }
            if (url.pathname.endsWith("/sellers")) {
                return jsonResponse([{ id: 7, kind: "user", cms_user_id: "seller-user-123" }]);
            }
            return jsonResponse({ error: "unexpected request" }, 500);
        });

        const checkout = await requestCommerce("/system/protected-checkout/seller-context", {
            userId: "buyer-user-456",
            body: { items: [{ offerId: "91", quantity: 1 }] },
        });
        const payment = await requestCommerce("/system/protected-payment/seller-context", {
            userId: "buyer-user-456",
            body: { orderId: 42 },
        });

        expect(checkout.status).toBe(200);
        expect(await checkout.json()).toEqual({
            sellerCmsUserId: "seller-user-123",
            buyerCmsUserId: "buyer-user-456",
        });
        expect(payment.status).toBe(200);
        expect(await payment.json()).toEqual({
            sellerCmsUserId: "seller-user-123",
            buyerCmsUserId: "buyer-user-456",
        });
        expect(requestedPaths.filter(path => path.startsWith("/rest/v1/sellers?"))).toHaveLength(2);
        expect(requestedPaths.every(path => !path.includes("rpc/create_order_from_offers"))).toBeTrue();
    });

    test("does not disclose an order seller context to another buyer", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/orders")) {
                return jsonResponse([{ id: 42, seller_id: 7, buyer_cms_user_id: "actual-buyer" }]);
            }
            return jsonResponse({ error: "seller lookup must not run" }, 500);
        });

        const response = await requestCommerce("/system/protected-payment/seller-context", {
            userId: "other-buyer",
            body: { orderId: 42 },
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "order not found" });
    });

    test("enriches order lists with one bounded read-model query", async () => {
        const requestedPaths: string[] = [];
        setRestResponder(async request => {
            const url = new URL(request.url);
            requestedPaths.push(`${url.pathname}?${url.searchParams.toString()}`);
            if (url.pathname.endsWith("/rpc/list_order_read_model")) {
                return jsonResponse({
                    state: "ok",
                    orders: [
                    { id: 12, status: "active", order_number: "ORDER-12", total_amount: 2500, currency: "eur" },
                    { id: 18, status: "awaiting_payment", order_number: "ORDER-18", total_amount: 3100, currency: "eur" },
                    ],
                    operations: [
                    {
                        order_id: 12,
                        payment_status: "succeeded",
                        fulfillment_status: "awaiting_shipment",
                        settlement_status: "manual_review",
                        claim_status: null,
                        total_refund_requested_amount: 0,
                    },
                    ],
                    definitions: [],
                    total: 2,
                });
            }
            return jsonResponse({ error: "unexpected request" }, 500);
        });

        const response = await requestCommerce("/me/orders?limit=20&offset=0", {
            userId: "buyer-user-456",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            total: 2,
            items: [
                {
                    id: 12,
                    status: "active",
                    operation: {
                        orderId: 12,
                        paymentStatus: "succeeded",
                        fulfillmentStatus: "awaiting_shipment",
                        settlementStatus: "manual_review",
                        claimStatus: null,
                        totalRefundRequestedAmount: 0,
                    },
                },
                { id: 18, status: "awaiting_payment", operation: null },
            ],
        });
        expect(requestedPaths).toHaveLength(1);
        expect(expectRpc("list_order_read_model").body).toEqual({
            p_scope: "buyer",
            p_cms_user_id: "buyer-user-456",
            p_status: null,
            p_seller_id: null,
            p_limit: 20,
            p_offset: 0,
        });
    });

    test("uses server-trusted offers instead of client pricing and snapshots", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/custom_field_definitions")) {
                return jsonResponse([{
                    key: "checkout", label: "Checkout channel", field_type: "string",
                    unit: null, enabled: true, public_readable: true, position: 0,
                }]);
            }
            return jsonResponse({ id: 1, metadata: { checkout: "web" } });
        });

        const response = await requestCommerce("/me/orders", {
            userId: "buyer-user-456",
            body: {
                buyerCmsUserId: "spoofed-buyer",
                idempotencyKey: "checkout-123",
                items: [{
                    offerId: 91,
                    quantity: 2,
                    sellerId: "spoofed-seller",
                    unitAmount: 1,
                    totalAmount: 2,
                    currency: "usd",
                    offerSnapshot: { acceptedPriceAmount: 1 },
                    sellerSnapshot: { id: "spoofed-seller" },
                }],
                shippingAddress: { city: "Paris" },
                billingAddress: { city: "Lyon" },
                metadata: { checkout: "web" },
            },
        });

        expect(response.status).toBe(201);
        expect(expectRpc("create_order_from_offers").body).toEqual({
            p_buyer_cms_user_id: "buyer-user-456",
            p_idempotency_key: "checkout-123",
            p_items: [{ offerId: 91, quantity: 2 }],
            p_shipping_address: { city: "Paris" },
            p_billing_address: { city: "Lyon" },
            p_metadata: { checkout: "web" },
        });
    });
});
