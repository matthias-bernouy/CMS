import { describe, expect, test } from "bun:test";
import {
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

const scenario = scenarios[2]!;

describe("commerce shipment-creation seller context boundaries", () => {
    test("fails closed on every malformed bounded context", async () => {
        const malformed = [
            {},
            { state: "future_state" },
            { state: "ok" },
            ok(null),
            ok({ id: 42, public_id: "order", allowed: true }),
            ok({
                id: Number.MAX_SAFE_INTEGER + 1,
                public_id: "order",
                allowed: true,
                seller_cms_user_id: sellerCmsUserId,
            }),
            ok({
                id: 42,
                public_id: 42,
                allowed: true,
                seller_cms_user_id: sellerCmsUserId,
            }),
            ok({
                id: 42,
                public_id: "order",
                allowed: "yes",
                seller_cms_user_id: sellerCmsUserId,
            }),
            ok({
                id: 42,
                public_id: "order",
                allowed: true,
                seller_cms_user_id: 42,
            }),
        ];

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

    test("fails closed on the hidden invalid-authorization state", async () => {
        useRpcResult({ state: "invalid_authorization" });

        const response = await requestCommerce(scenario.route, {
            userId: sellerCmsUserId,
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: `${scenario.rpc} returned an invalid response`,
        });
    });
});
