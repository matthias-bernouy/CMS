import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import {
    expectedSelectionContext,
    expectedSetupContext,
    ok,
    orderId,
    selectionContext,
    selectionRoute,
    setupContext,
    setupRoute,
    useRpcResult,
    userId,
} from "./fixtures";

installCommerceTestEnvironment();

describe("commerce delivery contexts", () => {
    test("returns the exact setup context through one actor-scoped RPC", async () => {
        useRpcResult(ok(setupContext));

        const response = await requestCommerce(setupRoute, { userId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedSetupContext);
        expect(expectSingleRpc("get_order_delivery_setup_context").body).toEqual({
            p_order_id: orderId,
            p_buyer_cms_user_id: userId,
        });
    });

    test("preserves an unavailable authorization on a non-awaiting order", async () => {
        useRpcResult(ok({
            order: {
                ...setupContext.order,
                status: "cancelled",
            },
            authorization: null,
            private_context_value: "must not leak",
        }));

        const response = await requestCommerce(setupRoute, { userId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            order: {
                ...expectedSetupContext.order,
                status: "cancelled",
            },
            authorization: null,
        });
        expectSingleRpc("get_order_delivery_setup_context");
    });

    test("returns the exact selection context through one actor-scoped RPC", async () => {
        useRpcResult(ok(selectionContext));

        const response = await requestCommerce(selectionRoute, { userId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedSelectionContext);
        expect(expectSingleRpc("get_order_delivery_selection_context").body)
            .toEqual({
                p_order_id: orderId,
                p_buyer_cms_user_id: userId,
            });
    });

    test("preserves a nullable delivery quote without adding private terms", async () => {
        useRpcResult(ok({
            ...selectionContext,
            delivery_quote_id: null,
        }));

        const response = await requestCommerce(selectionRoute, { userId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ...expectedSelectionContext,
            deliveryQuoteId: null,
        });
        expectSingleRpc("get_order_delivery_selection_context");
    });
});
