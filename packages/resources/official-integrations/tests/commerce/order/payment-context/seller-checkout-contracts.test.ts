import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    checkoutRoute,
    expectDatabaseReads,
    expectQuery,
    responseBody,
    sellerCmsUserId,
    useSellerContextData,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

describe("commerce protected-checkout seller context contracts", () => {
    test("returns the exact private-marketplace identities through two bounded reads", async () => {
        useSellerContextData({
            offers: [
                { id: 91, seller_id: 7, price: 9_999, private_offer: "must not leak" },
                { id: 92, seller_id: 7, product_snapshot: { title: "must not leak" } },
            ],
            sellers: [
                {
                    id: 7,
                    kind: "user",
                    cms_user_id: `  ${sellerCmsUserId}  `,
                    email: "seller-private@example.test",
                    address: { line1: "must not leak" },
                    stripe_account_id: "acct_must_not_leak",
                },
            ],
        });

        const response = await requestCommerce(checkoutRoute, {
            userId: `  ${buyerCmsUserId}  `,
            body: {
                items: [{ offerId: "91" }, { offerId: 92 }, { offerId: 91 }],
            },
        });

        expect(await responseBody(response)).toEqual([200, { sellerCmsUserId, buyerCmsUserId }]);
        const [offers, seller] = expectDatabaseReads(["offers", "sellers"]);
        expectQuery(offers!, {
            select: "id,seller_id",
            id: "in.(91,92)",
        });
        expectQuery(seller!, {
            select: "id,kind,cms_user_id",
            limit: "1",
            id: "eq.7",
        });
    });

    test("returns not found after the single offers read when any offer is absent", async () => {
        useSellerContextData({ offers: [{ id: 91, seller_id: 7 }] });

        const response = await requestCommerce(checkoutRoute, {
            userId: buyerCmsUserId,
            body: { items: [{ offerId: 91 }, { offerId: 92 }] },
        });

        expect(await responseBody(response)).toEqual([404, { error: "offer not found" }]);
        expectDatabaseReads(["offers"]);
    });

    test("rejects multiple sellers after the single offers read", async () => {
        useSellerContextData({
            offers: [
                { id: 91, seller_id: 7 },
                { id: 92, seller_id: 8 },
            ],
        });

        const response = await requestCommerce(checkoutRoute, {
            userId: buyerCmsUserId,
            body: { items: [{ offerId: 91 }, { offerId: 92 }] },
        });

        expect(await responseBody(response)).toEqual([
            409,
            { error: "one protected order cannot contain multiple sellers" },
        ]);
        expectDatabaseReads(["offers"]);
    });

    for (const [label, sellers] of [
        ["absent", []],
        ["not a user", [{ id: 7, kind: "merchant", cms_user_id: null }]],
        ["missing its CMS user id", [{ id: 7, kind: "user", cms_user_id: null }]],
    ] as const) {
        test(`rejects a seller that is ${label} after exactly two reads`, async () => {
            useSellerContextData({ sellers: [...sellers] });

            const response = await requestCommerce(checkoutRoute, {
                userId: buyerCmsUserId,
                body: { items: [{ offerId: 91 }, { offerId: 92 }] },
            });

            expect(await responseBody(response)).toEqual([
                409,
                { error: "protected marketplace seller identity is unavailable" },
            ]);
            expectDatabaseReads(["offers", "sellers"]);
        });
    }
});
