import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    checkoutRoute,
    expectSellerContextRpc,
    responseBody,
    sellerCmsUserId,
    sellerContextFunction,
    useSellerContextFailure,
    useSellerContextResponse,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

const checkoutBody = (offerIds: number[], buyer: string | null = null) => ({
    p_scope: "checkout",
    p_offer_ids: offerIds,
    p_order_id: null,
    p_buyer_cms_user_id: buyer,
    p_price_agreement_public_id: null,
});

describe("commerce protected-checkout seller context boundaries", () => {
    test("rejects invalid CMS authentication and methods before parsing or PostgREST", async () => {
        const unauthenticated = await requestCommerce(checkoutRoute, {
            authenticated: false,
            body: { items: [{ offerId: 91 }] },
        });
        const wrongKey = await requestCommerce(checkoutRoute, {
            authorization: "Bearer wrong-key",
            body: { items: [{ offerId: 91 }] },
        });
        const wrongMethod = await requestCommerce(checkoutRoute, {
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

    test("validates checkout items before resolving the actor or reading offers", async () => {
        const cases = [
            [{}, "provide exactly one of agreementId or items"],
            [{ items: [] }, "items must be a non-empty array of objects"],
            [{ items: ["invalid"] }, "items must be a non-empty array of objects"],
            [{ items: [{}] }, "items.0.offerId is required"],
            [{ items: [{ offerId: "1.5" }] }, "items.0.offerId must be an integer"],
            [{ items: [{ offerId: 0 }] }, "items.0.offerId must be positive"],
        ] as const;

        for (const [body, error] of cases) {
            const response = await requestCommerce(checkoutRoute, { body });
            expect(await responseBody(response)).toEqual([400, { error }]);
        }
        expect(capturedFetches()).toEqual([]);
    });

    test("keeps offer-state precedence over missing actor identity in one RPC", async () => {
        for (const [state, status, error, offerIds] of [
            ["identity_required", 401, "missing CMS user id", [91]],
            ["offer_not_found", 404, "offer not found", [91]],
            ["multiple_sellers", 409, "one protected order cannot contain multiple sellers", [91, 92]],
        ] as const) {
            useSellerContextResponse({ state });
            const start = capturedFetches().length;
            const response = await requestCommerce(checkoutRoute, {
                body: { items: offerIds.map((offerId) => ({ offerId })) },
            });
            expect(await responseBody(response)).toEqual([status, { error }]);
            expectSellerContextRpc(checkoutBody([...offerIds]), start);
        }
    });

    test("preserves PostgREST failure mapping without retries", async () => {
        for (const [message, expected] of [
            ["seller context unavailable", "seller context unavailable"],
            [undefined, "Supabase request failed (503)"],
        ] as const) {
            useSellerContextFailure(503, message);
            const start = capturedFetches().length;
            const response = await requestCommerce(checkoutRoute, {
                userId: buyerCmsUserId,
                body: { items: [{ offerId: 91 }] },
            });
            expect(await responseBody(response)).toEqual([502, { error: expected }]);
            expectSellerContextRpc(checkoutBody([91], buyerCmsUserId), start);
        }
    });

    test("fails closed for malformed, unknown, and wrong-scope RPC responses", async () => {
        for (const value of [
            null,
            {},
            { state: "ok" },
            { state: "ok", context: { seller_cms_user_id: sellerCmsUserId } },
            { state: "unknown" },
            { state: "order_not_found" },
        ]) {
            useSellerContextResponse(value);
            const response = await requestCommerce(checkoutRoute, {
                userId: buyerCmsUserId,
                body: { items: [{ offerId: 91 }] },
            });
            expect(await responseBody(response)).toEqual([
                502,
                { error: `${sellerContextFunction} returned an invalid response` },
            ]);
        }
    });
});
