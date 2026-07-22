import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    expectDatabaseReads,
    paymentRoute,
    responseBody,
    useSellerContextData,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

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

    test("requires actor identity before the order read for a valid selector", async () => {
        useSellerContextData();

        const response = await requestCommerce(paymentRoute, { body: { orderId: 42 } });

        expect(await responseBody(response)).toEqual([401, { error: "missing CMS user id" }]);
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves first- and second-read PostgREST failures without extra calls", async () => {
        useSellerContextData({
            failures: { orders: { status: 503, body: { message: "order context unavailable" } } },
        });
        let start = capturedFetches().length;
        const orderFailure = await requestCommerce(paymentRoute, {
            userId: buyerCmsUserId,
            body: { orderId: 42 },
        });
        expect(await responseBody(orderFailure)).toEqual([502, { error: "order context unavailable" }]);
        expectDatabaseReads(["orders"], start);

        useSellerContextData({ failures: { sellers: { status: 503 } } });
        start = capturedFetches().length;
        const sellerFailure = await requestCommerce(paymentRoute, {
            userId: buyerCmsUserId,
            body: { orderId: 42 },
        });
        expect(await responseBody(sellerFailure)).toEqual([502, { error: "Supabase request failed (503)" }]);
        expectDatabaseReads(["orders", "sellers"], start);
    });
});
