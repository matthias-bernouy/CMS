import { describe, expect, test } from "bun:test";
import { capturedFetches, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    checkoutRoute,
    expectDatabaseReads,
    responseBody,
    useSellerContextData,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

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
            [{}, "items must be a non-empty array of objects"],
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

    test("reads offers before actor identity and preserves offer-state precedence", async () => {
        useSellerContextData({ offers: [{ id: 91, seller_id: 7 }] });
        let start = capturedFetches().length;
        const identityRequired = await requestCommerce(checkoutRoute, {
            body: { items: [{ offerId: 91 }] },
        });
        expect(await responseBody(identityRequired)).toEqual([401, { error: "missing CMS user id" }]);
        expectDatabaseReads(["offers"], start);

        useSellerContextData({ offers: [] });
        start = capturedFetches().length;
        const missingOffer = await requestCommerce(checkoutRoute, {
            body: { items: [{ offerId: 91 }] },
        });
        expect(await responseBody(missingOffer)).toEqual([404, { error: "offer not found" }]);
        expectDatabaseReads(["offers"], start);

        useSellerContextData({
            offers: [
                { id: 91, seller_id: 7 },
                { id: 92, seller_id: 8 },
            ],
        });
        start = capturedFetches().length;
        const multipleSellers = await requestCommerce(checkoutRoute, {
            body: { items: [{ offerId: 91 }, { offerId: 92 }] },
        });
        expect(await responseBody(multipleSellers)).toEqual([
            409,
            { error: "one protected order cannot contain multiple sellers" },
        ]);
        expectDatabaseReads(["offers"], start);
    });

    test("preserves first- and second-read PostgREST failures without extra calls", async () => {
        useSellerContextData({
            failures: { offers: { status: 503, body: { message: "offer context unavailable" } } },
        });
        let start = capturedFetches().length;
        const offerFailure = await requestCommerce(checkoutRoute, {
            userId: buyerCmsUserId,
            body: { items: [{ offerId: 91 }] },
        });
        expect(await responseBody(offerFailure)).toEqual([502, { error: "offer context unavailable" }]);
        expectDatabaseReads(["offers"], start);

        useSellerContextData({
            offers: [{ id: 91, seller_id: 7 }],
            failures: { sellers: { status: 503 } },
        });
        start = capturedFetches().length;
        const sellerFailure = await requestCommerce(checkoutRoute, {
            userId: buyerCmsUserId,
            body: { items: [{ offerId: 91 }] },
        });
        expect(await responseBody(sellerFailure)).toEqual([502, { error: "Supabase request failed (503)" }]);
        expectDatabaseReads(["offers", "sellers"], start);
    });
});
