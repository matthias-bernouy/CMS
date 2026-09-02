import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { ok, selectionContext, selectionRoute, setupContext, setupRoute, useRpcResult, userId } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce delivery context response validation", () => {
    const malformedSetup = [
        ["the envelope is missing", {}],
        ["the state is unknown", { state: "future_state" }],
        ["the context is missing", { state: "ok" }],
        ["the order is missing", ok({ authorization: null })],
        [
            "an order field is missing",
            ok({
                ...setupContext,
                order: { ...setupContext.order, public_id: undefined },
            }),
        ],
        [
            "the order version is unsafe",
            ok({
                ...setupContext,
                order: {
                    ...setupContext.order,
                    version: Number.MAX_SAFE_INTEGER + 1,
                },
            }),
        ],
        [
            "the authorization has a wrong type",
            ok({
                ...setupContext,
                authorization: [],
            }),
        ],
        [
            "an authorization field is missing",
            ok({
                ...setupContext,
                authorization: {
                    ...setupContext.authorization,
                    currency: undefined,
                },
            }),
        ],
        [
            "the shipping address is not an object",
            ok({
                ...setupContext,
                authorization: {
                    ...setupContext.authorization,
                    shipping_address: "private address",
                },
            }),
        ],
        [
            "the order belongs to another actor",
            ok({
                ...setupContext,
                order: {
                    ...setupContext.order,
                    buyer_cms_user_id: "another-buyer",
                },
            }),
        ],
        [
            "an awaiting order has no authorization",
            ok({
                ...setupContext,
                authorization: null,
            }),
        ],
        [
            "a non-awaiting order has an authorization",
            ok({
                order: {
                    ...setupContext.order,
                    status: "cancelled",
                },
                authorization: {
                    ...setupContext.authorization,
                    status: "cancelled",
                },
            }),
        ],
        [
            "the authorization buyer changed",
            ok({
                ...setupContext,
                authorization: {
                    ...setupContext.authorization,
                    buyer_cms_user_id: "another-buyer",
                },
            }),
        ],
        [
            "the authorization status changed",
            ok({
                ...setupContext,
                authorization: {
                    ...setupContext.authorization,
                    status: "cancelled",
                },
            }),
        ],
        [
            "the authorization version changed",
            ok({
                ...setupContext,
                authorization: {
                    ...setupContext.authorization,
                    order_version: 8,
                },
            }),
        ],
    ] as const;

    for (const [label, value] of malformedSetup) {
        test(`fails closed when setup ${label}`, async () => {
            useRpcResult(value);

            const response = await requestCommerce(setupRoute, { userId });

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "get_order_delivery_setup_context returned an invalid response",
            });
        });
    }

    const malformedSelection = [
        ["the envelope is missing", {}],
        ["the state is unknown", { state: "seller_unavailable" }],
        ["the context is missing", { state: "ok" }],
        [
            "a field is missing",
            ok({
                ...selectionContext,
                delivery_quote_id: undefined,
            }),
        ],
        [
            "the public id has a wrong type",
            ok({
                ...selectionContext,
                public_id: 42,
            }),
        ],
        [
            "the buyer id has a wrong type",
            ok({
                ...selectionContext,
                buyer_cms_user_id: null,
            }),
        ],
        [
            "the order belongs to another actor",
            ok({
                ...selectionContext,
                buyer_cms_user_id: "another-buyer",
            }),
        ],
        [
            "the quote id has a wrong type",
            ok({
                ...selectionContext,
                delivery_quote_id: 42,
            }),
        ],
    ] as const;

    for (const [label, value] of malformedSelection) {
        test(`fails closed when selection ${label}`, async () => {
            useRpcResult(value);

            const response = await requestCommerce(selectionRoute, { userId });

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "get_order_delivery_selection_context returned an invalid response",
            });
        });
    }
});
