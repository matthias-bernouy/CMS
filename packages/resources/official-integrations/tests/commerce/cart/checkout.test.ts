import { describe, expect, test } from "bun:test";
import { expectRpc, installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

const userId = "buyer-user-456";

describe("commerce cart checkout route", () => {
    test("maps trusted checkout inputs and returns 201 for a new checkout", async () => {
        setRestResponder((request) =>
            new URL(request.url).pathname.endsWith("/custom_field_definitions")
                ? jsonResponse([])
                : jsonResponse({ checkout_group_id: "group-1", orders: [], idempotent_replay: false }),
        );

        const response = await requestCommerce("/me/cart/checkout", {
            userId,
            body: {
                expectedVersion: 7,
                idempotencyKey: "checkout-123",
                shippingAddress: { city: "Paris" },
                billingAddress: { city: "Lyon" },
                metadata: { channel: "web" },
                buyerCmsUserId: "spoofed-buyer",
                items: [{ offerId: 91, quantity: 99 }],
                totalAmount: 1,
            },
        });

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
            checkoutGroupId: "group-1",
            orders: [],
            idempotentReplay: false,
        });
        expect(expectRpc("checkout_cart").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_expected_version: 7,
            p_idempotency_key: "checkout-123",
            p_shipping_address: { city: "Paris" },
            p_billing_address: { city: "Lyon" },
            p_metadata: { channel: "web" },
        });
    });

    test("returns 200 for an idempotent replay and defaults optional objects", async () => {
        setRestResponder((request) =>
            new URL(request.url).pathname.endsWith("/custom_field_definitions")
                ? jsonResponse([])
                : jsonResponse({ checkout_group_id: "group-1", orders: [], idempotent_replay: true }),
        );

        const response = await requestCommerce("/me/cart/checkout", {
            userId,
            body: { expectedVersion: 7, idempotencyKey: "checkout-123" },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            checkoutGroupId: "group-1",
            orders: [],
            idempotentReplay: true,
        });
        expect(expectRpc("checkout_cart").body).toEqual({
            p_buyer_cms_user_id: userId,
            p_expected_version: 7,
            p_idempotency_key: "checkout-123",
            p_shipping_address: {},
            p_billing_address: {},
            p_metadata: {},
        });
    });

    test("rejects missing identity and required checkout fields", async () => {
        setRestResponder(() => jsonResponse([]));
        const missingOwner = await requestCommerce("/me/cart/checkout", {
            body: {
                expectedVersion: 7,
                idempotencyKey: "checkout-123",
                buyerCmsUserId: "spoofed-buyer",
            },
        });
        const missingVersion = await requestCommerce("/me/cart/checkout", {
            userId,
            body: { idempotencyKey: "checkout-123" },
        });
        const missingKey = await requestCommerce("/me/cart/checkout", {
            userId,
            body: { expectedVersion: 7 },
        });

        expect(await missingOwner.json()).toEqual({ error: "missing CMS user id" });
        expect(await missingVersion.json()).toEqual({ error: "expectedVersion is required" });
        expect(await missingKey.json()).toEqual({ error: "idempotencyKey is required" });
    });

    test("rejects non-object addresses and metadata", async () => {
        for (const key of ["shippingAddress", "billingAddress", "metadata"] as const) {
            const response = await requestCommerce("/me/cart/checkout", {
                userId,
                body: {
                    expectedVersion: 7,
                    idempotencyKey: "checkout-123",
                    [key]: [],
                },
            });

            expect(response.status).toBe(400);
            expect(await response.json()).toEqual({ error: `${key} must be an object` });
        }
    });
});
