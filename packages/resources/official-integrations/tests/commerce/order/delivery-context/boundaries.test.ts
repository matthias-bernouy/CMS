import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { orderId, selectionRoute, setupRoute, useRpcResult, userId } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce delivery context boundaries", () => {
    test("rejects invalid access, methods, identities, and selectors locally", async () => {
        const routes = ["/system/order/delivery-setup-context", "/system/order/delivery-selection-context"];
        for (const route of routes) {
            const responses = await Promise.all([
                requestCommerce(`${route}?orderId=${orderId}`, {
                    authenticated: false,
                    userId,
                }),
                requestCommerce(`${route}?orderId=${orderId}`, {
                    authorization: "Bearer wrong-key",
                    userId,
                }),
                requestCommerce(`${route}?orderId=${orderId}`, {
                    method: "POST",
                    userId,
                }),
                requestCommerce(`${route}?orderId=${orderId}`),
                requestCommerce(route, { userId }),
                requestCommerce(`${route}?orderId=1.5`, { userId }),
                requestCommerce(`${route}?orderId=9007199254740992`, { userId }),
            ]);

            expect(await Promise.all(responses.map(responseBody))).toEqual([
                [401, { error: "invalid CMS API key" }],
                [401, { error: "invalid CMS API key" }],
                [405, "Method Not Allowed"],
                [401, { error: "missing CMS user id" }],
                [400, { error: "orderId is required" }],
                [400, { error: "orderId must be an integer" }],
                [400, { error: "orderId must be an integer" }],
            ]);
            expect(responses[2]!.headers.get("allow")).toBe("GET, OPTIONS");
        }
        expect(capturedFetches()).toEqual([]);
    });

    test("keeps OPTIONS public without database work", async () => {
        const responses = await Promise.all([
            requestCommerce(setupRoute, {
                authenticated: false,
                method: "OPTIONS",
            }),
            requestCommerce(selectionRoute, {
                authenticated: false,
                method: "OPTIONS",
            }),
        ]);

        expect(await Promise.all(responses.map(responseBody))).toEqual([
            [200, "ok"],
            [200, "ok"],
        ]);
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves every safe integer at both RPC boundaries", async () => {
        useRpcResult({ state: "not_found" });
        const routes = ["/system/order/delivery-setup-context", "/system/order/delivery-selection-context"];
        for (const route of routes) {
            for (const id of [0, -1, Number.MAX_SAFE_INTEGER]) {
                const response = await requestCommerce(`${route}?orderId=${id}`, { userId: `  ${userId}  ` });
                expect(response.status).toBe(404);
            }
        }

        expect(capturedFetches().map((call) => call.body)).toEqual(
            routes.flatMap(() =>
                [0, -1, Number.MAX_SAFE_INTEGER].map((id) => ({
                    p_order_id: id,
                    p_buyer_cms_user_id: userId,
                })),
            ),
        );
    });

    test("maps bounded database states without leaking their payloads", async () => {
        const cases = [
            [setupRoute, "identity_required", 401, "missing CMS user id"],
            [setupRoute, "not_found", 404, "order not found"],
            [setupRoute, "seller_unavailable", 409, "protected delivery requires a C2C user seller"],
            [selectionRoute, "identity_required", 401, "missing CMS user id"],
            [selectionRoute, "not_found", 404, "order not found"],
        ] as const;
        for (const [route, state, status, error] of cases) {
            useRpcResult({
                state,
                context: { private_value: "must not leak" },
            });

            const response = await requestCommerce(route, { userId });

            expect(await responseBody(response)).toEqual([status, { error }]);
        }
    });

    test("preserves a sanitized upstream error through one RPC", async () => {
        useRpcResult({ message: "delivery context unavailable" }, 503);

        const response = await requestCommerce(setupRoute, { userId });

        expect(await responseBody(response)).toEqual([502, { error: "delivery context unavailable" }]);
        expect(capturedFetches()).toHaveLength(1);
    });
});

async function responseBody(response: Response): Promise<[number, unknown]> {
    return [
        response.status,
        response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text(),
    ];
}
