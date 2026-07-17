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
        setRestResponder(request => {
            const resource = resourceName(request.url);
            if (resource === "sellers") return jsonResponse([{ id: 17 }]);
            if (resource === "orders") return jsonResponse([], 200, { "content-range": "*/4" });
            if (resource === "custom_field_definitions") return jsonResponse([]);
            throw new Error(`Unexpected deep-offset request: ${request.url}`);
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
            expect(new URL(callsFor("orders").at(-1)!.url).searchParams.get("offset"))
                .toBe(String(offset));
        }
    });

    test("preserves sellerId validation and seller-route ignore semantics", async () => {
        useCompleteOrderResponder();

        const missingIdentity = await requestCommerce("/me/orders?sellerId=invalid");
        expect({ status: missingIdentity.status, body: await missingIdentity.json() }).toEqual({
            status: 401, body: { error: "missing CMS user id" },
        });
        for (const route of ["/me/orders", "/admin/orders"]) {
            const response = await requestCommerce(`${route}?sellerId=invalid`, { userId: buyerId });
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route, status: 400, body: { error: "sellerId must be an integer" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);

        const seller = await requestCommerce(
            "/me/sales?sellerId=invalid&limit=2&offset=2",
            { userId: sellerUserId },
        );
        expect(seller.status).toBe(200);
        expect(await seller.json()).toEqual(expectedSellerList);
    });

    test("rejects invalid offsets locally on every list", async () => {
        for (const route of ["/me/orders", "/me/sales", "/admin/orders"]) {
            const response = await requestCommerce(`${route}?offset=invalid`, { userId: "actor" });
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route, status: 400, body: { error: "offset must be an integer" },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves the first upstream failure on each list", async () => {
        setRestResponder(() => jsonResponse({ message: "order list unavailable" }, 503));
        const cases = [
            ["/me/orders", { userId: buyerId }, "orders"],
            ["/me/sales", { userId: sellerUserId }, "sellers"],
            ["/admin/orders", {}, "orders"],
        ] as const;
        for (const [route, options, resource] of cases) {
            const before = capturedFetches().length;
            const response = await requestCommerce(route, options);
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route, status: 502, body: { error: "order list unavailable" },
            });
            const calls = capturedFetches().slice(before);
            expect(calls).toHaveLength(1);
            expect(resourceName(calls[0]!.url)).toBe(resource);
        }
    });
});

function resourceName(url: string): string {
    return new URL(url).pathname.split("/").at(-1)!;
}
