import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import {
    ok,
    scenarios,
    sellerCmsUserId,
    useRpcResult,
} from "./fixtures";

installCommerceTestEnvironment();

describe("commerce seller fulfillment context boundaries", () => {
    test("rejects CMS auth, methods, identities, and selectors locally", async () => {
        for (const scenario of scenarios) {
            const route = scenario.route.split("?")[0]!;
            const responses = await Promise.all([
                requestCommerce(scenario.route, {
                    authenticated: false,
                    userId: sellerCmsUserId,
                }),
                requestCommerce(scenario.route, {
                    authorization: "Bearer wrong-key",
                    userId: sellerCmsUserId,
                }),
                requestCommerce(scenario.route, {
                    method: "POST",
                    userId: sellerCmsUserId,
                }),
                requestCommerce(scenario.route),
                requestCommerce(route, { userId: sellerCmsUserId }),
                requestCommerce(`${route}?orderId=1.5`, {
                    userId: sellerCmsUserId,
                }),
                requestCommerce(`${route}?orderId=9007199254740992`, {
                    userId: sellerCmsUserId,
                }),
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

    test("preserves all safe selectors and the trimmed actor in one RPC", async () => {
        useRpcResult({ state: "not_found" });
        const ids = [0, -1, Number.MAX_SAFE_INTEGER];
        for (const scenario of scenarios) {
            const route = scenario.route.split("?")[0]!;
            for (const id of ids) {
                const response = await requestCommerce(
                    `${route}?orderId=${id}`,
                    { userId: `  ${sellerCmsUserId}  ` },
                );
                expect(response.status).toBe(404);
                expect(await response.json()).toEqual({
                    error: "sale not found",
                });
            }
        }
        expect(capturedFetches().map(call => call.body)).toEqual(
            scenarios.flatMap(() => ids.map(p_order_id => ({
                p_order_id,
                p_seller_cms_user_id: sellerCmsUserId,
            }))),
        );
    });

    test("maps bounded database states without leaking their payload", async () => {
        for (const scenario of scenarios) {
            for (const [state, status, error] of [
                ["identity_required", 401, "missing CMS user id"],
                ["not_found", 404, "sale not found"],
            ] as const) {
                useRpcResult({
                    state,
                    context: { private_value: "must not leak" },
                });
                const response = await requestCommerce(scenario.route, {
                    userId: sellerCmsUserId,
                });
                expect(await responseBody(response)).toEqual([
                    status,
                    { error },
                ]);
            }
        }
    });

    const malformedFulfillment = [
        {},
        { state: "future_state" },
        { state: "ok" },
        ok(null),
        ok({ id: 42, public_id: "order" }),
        ok({ id: Number.MAX_SAFE_INTEGER + 1, public_id: "order", order_number: "CO-42" }),
        ok({ id: 42, public_id: 42, order_number: "CO-42" }),
        ok({ id: 42, public_id: "order", order_number: 42 }),
    ];
    const malformedLabel = [
        {},
        { state: "future_state" },
        { state: "ok" },
        ok(null),
        ok({ public_id: "order", allowed: true }),
        ok({ public_id: 42, allowed: true, seller_cms_user_id: sellerCmsUserId }),
        ok({ public_id: "order", allowed: "yes", seller_cms_user_id: sellerCmsUserId }),
        ok({ public_id: "order", allowed: true, seller_cms_user_id: 42 }),
    ];

    for (const [scenario, malformed] of [
        [scenarios[0]!, malformedFulfillment],
        [scenarios[1]!, malformedLabel],
    ] as const) {
        test(`fails closed on malformed ${scenario.label} contexts`, async () => {
            for (const value of malformed) {
                useRpcResult(value);
                const response = await requestCommerce(scenario.route, {
                    userId: sellerCmsUserId,
                });
                expect(response.status).toBe(502);
                expect(await response.json()).toEqual({
                    error: `${scenario.rpc} returned an invalid response`,
                });
            }
        });
    }
});

async function responseBody(response: Response): Promise<[number, unknown]> {
    return [
        response.status,
        response.headers.get("content-type")?.includes("json")
            ? await response.json()
            : await response.text(),
    ];
}
