import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    expectSellerContextRpc,
    paymentRoute,
    responseBody,
    sellerCmsUserId,
    sellerContextFunction,
    useSellerContextFailure,
    useSellerContextResponse,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

const paymentBody = {
    p_scope: "payment",
    p_offer_ids: null,
    p_order_id: 42,
    p_buyer_cms_user_id: buyerCmsUserId,
};

describe("commerce protected-payment seller context boundaries", () => {
    test("rejects invalid CMS authentication and methods before PostgREST", async () => {
        const unauthenticated = await requestCommerce(paymentRoute, {
            authenticated: false,
            body: { orderId: 42 },
        });
        const wrongKey = await requestCommerce(paymentRoute, {
            authorization: "Bearer wrong-key",
            userId: buyerCmsUserId,
            body: { orderId: 42 },
        });
        const wrongMethod = await requestCommerce(paymentRoute, {
            method: "GET",
            userId: buyerCmsUserId,
        });

        expect(await responseBody(unauthenticated)).toEqual([401, { error: "invalid CMS API key" }]);
        expect(await responseBody(wrongKey)).toEqual([401, { error: "invalid CMS API key" }]);
        expect(wrongMethod.status).toBe(405);
        expect(await wrongMethod.text()).toBe("Method Not Allowed");
        expect(wrongMethod.headers.get("allow")).toBe("POST, OPTIONS");
        expect(capturedFetches()).toEqual([]);
    });

    test("validates the order selector before resolving actor identity", async () => {
        const cases = [
            [{}, "orderId is required"],
            [{ orderId: "1.5" }, "orderId must be an integer"],
            [{ orderId: 0 }, "orderId must be positive"],
            [{ orderId: -1 }, "orderId must be positive"],
            [{ orderId: Number.MAX_SAFE_INTEGER + 1 }, "orderId must be an integer"],
        ] as const;

        for (const [body, error] of cases) {
            const response = await requestCommerce(paymentRoute, { body });
            expect(await responseBody(response)).toEqual([400, { error }]);
        }
        expect(capturedFetches()).toEqual([]);
    });

    test("requires actor identity before the RPC for a valid selector", async () => {
        const response = await requestCommerce(paymentRoute, { body: { orderId: 42 } });

        expect(await responseBody(response)).toEqual([401, { error: "missing CMS user id" }]);
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves PostgREST failure mapping without retries", async () => {
        for (const [message, expected] of [
            ["order context unavailable", "order context unavailable"],
            [undefined, "Supabase request failed (503)"],
        ] as const) {
            useSellerContextFailure(503, message);
            const start = capturedFetches().length;
            const response = await requestCommerce(paymentRoute, {
                userId: buyerCmsUserId,
                body: { orderId: 42 },
            });
            expect(await responseBody(response)).toEqual([502, { error: expected }]);
            expectSellerContextRpc(paymentBody, start);
        }
    });

    test("fails closed for malformed, unknown, and wrong-scope RPC responses", async () => {
        for (const value of [
            null,
            {},
            { state: "ok" },
            { state: "ok", context: { seller_cms_user_id: sellerCmsUserId } },
            { state: "unknown" },
            { state: "offer_not_found" },
        ]) {
            useSellerContextResponse(value);
            const response = await requestCommerce(paymentRoute, {
                userId: buyerCmsUserId,
                body: { orderId: 42 },
            });
            expect(await responseBody(response)).toEqual([
                502,
                { error: `${sellerContextFunction} returned an invalid response` },
            ]);
        }
    });
});
