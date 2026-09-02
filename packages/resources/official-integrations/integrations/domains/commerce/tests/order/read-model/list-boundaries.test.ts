import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { expectedSellerList } from "./fixtures/expected-lists";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order list boundaries", () => {
    test("preserves safe-integer deep offsets and exact totals on empty pages", async () => {
        setRestResponder(async (request) => {
            if (resourceName(request.url) !== "list_order_read_model") {
                throw new Error(`Unexpected deep-offset request: ${request.url}`);
            }
            return jsonResponse({
                state: "ok",
                orders: [],
                operations: [],
                definitions: [],
                total: 4,
            });
        });
        const offset = 3_000_000_000;
        const cases = [
            ["/me/orders", { userId: buyerId }],
            ["/me/sales", { userId: sellerUserId }],
            ["/admin/orders", {}],
        ] as const;
        for (const [route, options] of cases) {
            const response = await requestCommerce(`${route}?limit=2&offset=${offset}`, options);
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 200,
                body: { items: [], total: 4, limit: 2, offset },
            });
            expect(callsFor("list_order_read_model").at(-1)!.body.p_offset).toBe(offset);
        }
    });

    test("preserves sellerId validation and seller-route ignore semantics", async () => {
        useCompleteOrderResponder();

        const missingIdentity = await requestCommerce("/me/orders?sellerId=invalid");
        expect({ status: missingIdentity.status, body: await missingIdentity.json() }).toEqual({
            status: 401,
            body: { error: "missing CMS user id" },
        });
        for (const route of ["/me/orders", "/admin/orders"]) {
            const response = await requestCommerce(`${route}?sellerId=invalid`, { userId: buyerId });
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 400,
                body: { error: "sellerId must be an integer" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);

        const seller = await requestCommerce("/me/sales?sellerId=invalid&limit=2&offset=2", { userId: sellerUserId });
        expect(seller.status).toBe(200);
        expect(await seller.json()).toEqual(expectedSellerList);
        expect(callsFor("list_order_read_model")[0]!.body.p_seller_id).toBeNull();
    });

    test("rejects invalid offsets locally on every list", async () => {
        for (const route of ["/me/orders", "/me/sales", "/admin/orders"]) {
            const response = await requestCommerce(`${route}?offset=invalid`, { userId: "actor" });
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 400,
                body: { error: "offset must be an integer" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves the first upstream failure on each list", async () => {
        setRestResponder(() => jsonResponse({ message: "order list unavailable" }, 503));
        const cases = [
            ["/me/orders", { userId: buyerId }],
            ["/me/sales", { userId: sellerUserId }],
            ["/admin/orders", {}],
        ] as const;
        for (const [route, options] of cases) {
            const before = capturedFetches().length;
            const response = await requestCommerce(route, options);
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 502,
                body: { error: "order list unavailable" },
            });
            const calls = capturedFetches().slice(before);
            expect(calls).toHaveLength(1);
            expect(resourceName(calls[0]!.url)).toBe("list_order_read_model");
        }
    });

    test("fails closed on malformed internal list envelopes", async () => {
        const empty = { orders: [], operations: [], definitions: [], total: 0 };
        const malformed = [
            null,
            { ...empty, state: "invalid_scope" },
            { ...empty, state: "identity_required" },
            { state: "ok", operations: [], definitions: [], total: 0 },
            { ...empty, state: "ok", orders: [null] },
            { ...empty, state: "ok", operations: [null] },
            { ...empty, state: "ok", definitions: [null] },
            { ...empty, state: "ok", total: null },
            { ...empty, state: "ok", total: "0" },
            { ...empty, state: "ok", total: -1 },
            { ...empty, state: "ok", total: 1.5 },
            { ...empty, state: "ok", total: Number.MAX_SAFE_INTEGER + 1 },
            { ...empty, state: "seller_missing" },
        ];
        for (const value of malformed) {
            setRestResponder(() => jsonResponse(value));
            const before = capturedFetches().length;
            const response = await requestCommerce("/me/orders", { userId: buyerId });
            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 502,
                body: { error: "list_order_read_model returned an invalid response" },
            });
            expect(capturedFetches().slice(before)).toHaveLength(1);
        }
        const scopeViolations = [
            {
                route: "/me/sales",
                options: { userId: sellerUserId },
                value: { ...empty, state: "ok", operations: [{}] },
            },
            {
                route: "/admin/orders",
                options: {},
                value: { ...empty, state: "ok", definitions: [{}] },
            },
        ] as const;
        for (const { route, options, value } of scopeViolations) {
            setRestResponder(() => jsonResponse(value));
            const before = capturedFetches().length;
            const response = await requestCommerce(route, options);
            expect({ status: response.status, body: await response.json() }).toEqual({
                status: 502,
                body: { error: "list_order_read_model returned an invalid response" },
            });
            expect(capturedFetches().slice(before)).toHaveLength(1);
        }
    });
});

function resourceName(url: string): string {
    return new URL(url).pathname.split("/").at(-1)!;
}
