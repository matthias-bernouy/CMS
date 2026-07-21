import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import {
    ok,
    orderId,
    publicId,
    scenarios,
    sellerCmsUserId,
    useRpcResult,
} from "./fixtures";

installCommerceTestEnvironment();

describe("commerce seller fulfillment contexts", () => {
    for (const scenario of scenarios) {
        test(`projects only the ${scenario.label} context through one actor-scoped RPC`, async () => {
            useRpcResult({
                state: "ok",
                context: {
                    ...scenario.database,
                    shipping_address: { line1: "7 Private Street" },
                    financial_terms: { seller_proceeds_amount: 2_500 },
                    provider_reference: "private-provider-reference",
                },
                private_state: "must not leak",
            });

            const response = await requestCommerce(scenario.route, {
                userId: sellerCmsUserId,
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual(scenario.expected);
            expect(expectSingleRpc(scenario.rpc).body).toEqual({
                p_order_id: orderId,
                p_seller_cms_user_id: sellerCmsUserId,
            });
        });
    }

    test("preserves a denied label authorization as data", async () => {
        useRpcResult(ok({
            public_id: publicId,
            allowed: false,
            seller_cms_user_id: sellerCmsUserId,
            denial_reason: "must not leak",
        }));

        const response = await requestCommerce(scenarios[1]!.route, {
            userId: sellerCmsUserId,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            publicId,
            allowed: false,
            sellerCmsUserId,
        });
        expectSingleRpc("get_order_label_seller_context");
    });

    test("preserves a denied shipment-creation authorization as data", async () => {
        useRpcResult(ok({
            id: orderId,
            public_id: publicId,
            allowed: false,
            seller_cms_user_id: sellerCmsUserId,
            denial_reason: "must not leak",
        }));

        const response = await requestCommerce(scenarios[2]!.route, {
            userId: sellerCmsUserId,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: orderId,
            publicId,
            allowed: false,
            sellerId: sellerCmsUserId,
        });
        expectSingleRpc("get_order_shipment_creation_seller_context");
    });
});
