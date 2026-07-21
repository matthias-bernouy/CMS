import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

const databaseContext = {
    id: 42,
    public_id: "00000000-0000-4000-8000-000000000042",
    buyer_cms_user_id: "buyer-user",
};
const expectedContext = {
    id: 42,
    publicId: "00000000-0000-4000-8000-000000000042",
    buyerCmsUserId: "buyer-user",
};

installCommerceTestEnvironment();

describe("commerce order payment context", () => {
    test("returns only three actor-scoped fields through one RPC", async () => {
        setRestResponder(() =>
            jsonResponse({
                state: "ok",
                context: {
                    ...databaseContext,
                    shipping_address: { line1: "must not leak" },
                    financial_terms: { buyer_total_amount: 2_500 },
                },
                private_state: "must not leak",
            }),
        );

        const response = await requestContext();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedContext);
        expect(expectSingleRpc("get_order_payment_context").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-user",
        });
    });

    for (const [state, status, error] of [
        ["not_found", 404, "order not found"],
        ["identity_required", 401, "missing CMS user id"],
    ] as const) {
        test(`maps ${state} without leaking database details`, async () => {
            setRestResponder(() =>
                jsonResponse({
                    state,
                    context: { shipping_address: "must not leak" },
                }),
            );

            const response = await requestContext();

            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error });
            expectSingleRpc("get_order_payment_context");
        });
    }

    test("rejects authentication, method, identity, and selectors before DB work", async () => {
        const unauthenticated = await requestContext({ authenticated: false });
        const wrongMethod = await requestContext({ method: "POST" });
        const missingIdentity = await requestCommerce("/system/order/payment-context?orderId=42");
        const missingSelector = await requestCommerce("/system/order/payment-context", { userId: "buyer-user" });
        const unsafeSelector = await requestCommerce("/system/order/payment-context?orderId=9007199254740992", {
            userId: "buyer-user",
        });

        expect({
            unauthenticated: [unauthenticated.status, await unauthenticated.json()],
            wrongMethod: [wrongMethod.status, await wrongMethod.text(), wrongMethod.headers.get("allow")],
            missingIdentity: [missingIdentity.status, await missingIdentity.json()],
            missingSelector: [missingSelector.status, await missingSelector.json()],
            unsafeSelector: [unsafeSelector.status, await unsafeSelector.json()],
        }).toEqual({
            unauthenticated: [401, { error: "invalid CMS API key" }],
            wrongMethod: [405, "Method Not Allowed", "GET, OPTIONS"],
            missingIdentity: [401, { error: "missing CMS user id" }],
            missingSelector: [400, { error: "orderId is required" }],
            unsafeSelector: [400, { error: "orderId must be an integer" }],
        });
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves every safe integer selector at the DB boundary", async () => {
        setRestResponder(() => jsonResponse({ state: "not_found" }));

        const ids = [0, -1, Number.MAX_SAFE_INTEGER];
        const statuses = [];
        for (const id of ids) {
            statuses.push(
                (await requestCommerce(`/system/order/payment-context?orderId=${id}`, { userId: "buyer-user" })).status,
            );
        }

        expect(statuses).toEqual([404, 404, 404]);
        expect(capturedFetches().map((call) => call.body)).toEqual(
            ids.map((p_order_id) => ({
                p_order_id,
                p_buyer_cms_user_id: "buyer-user",
            })),
        );
    });

    for (const [label, malformed] of [
        ["the context is missing", { state: "ok" }],
        [
            "a field is missing",
            {
                state: "ok",
                context: { ...databaseContext, public_id: undefined },
            },
        ],
        [
            "the id is unsafe",
            {
                state: "ok",
                context: { ...databaseContext, id: Number.MAX_SAFE_INTEGER + 1 },
            },
        ],
        [
            "the public id has the wrong type",
            {
                state: "ok",
                context: { ...databaseContext, public_id: 42 },
            },
        ],
        [
            "the state is unknown",
            {
                state: "unexpected",
                context: databaseContext,
            },
        ],
    ] as const) {
        test(`fails closed when ${label}`, async () => {
            setRestResponder(() => jsonResponse(malformed));

            const response = await requestContext();

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "get_order_payment_context returned an invalid response",
            });
        });
    }
});

function requestContext(options: { authenticated?: boolean; method?: string } = {}): Promise<Response> {
    return requestCommerce("/system/order/payment-context?orderId=42", { userId: "buyer-user", ...options });
}
