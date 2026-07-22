import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    expectDatabaseReads,
    expectQuery,
    paymentRoute,
    responseBody,
    sellerCmsUserId,
    useSellerContextData,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

describe("commerce protected-payment seller context contracts", () => {
    test("returns the exact buyer-owned identities through two bounded reads", async () => {
        useSellerContextData({
            orders: [
                {
                    id: 42,
                    seller_id: 7,
                    buyer_cms_user_id: buyerCmsUserId,
                    shipping_address: { line1: "must not leak" },
                    billing_address: { line1: "must not leak" },
                    financial_terms: { seller_proceeds_amount: 8_000 },
                },
            ],
            sellers: [
                {
                    id: 7,
                    kind: "user",
                    cms_user_id: sellerCmsUserId,
                    email: "seller-private@example.test",
                    stripe_account_id: "acct_must_not_leak",
                },
            ],
        });

        const response = await requestCommerce(paymentRoute, {
            userId: buyerCmsUserId,
            body: { orderId: "42" },
        });

        expect(await responseBody(response)).toEqual([200, { sellerCmsUserId, buyerCmsUserId }]);
        const [order, seller] = expectDatabaseReads(["orders", "sellers"]);
        expectQuery(order!, {
            select: "id,seller_id,buyer_cms_user_id",
            limit: "1",
            id: "eq.42",
        });
        expectQuery(seller!, {
            select: "id,kind,cms_user_id",
            limit: "1",
            id: "eq.7",
        });
    });

    for (const [label, orders] of [
        ["is absent", []],
        ["belongs to another buyer", [{ id: 42, seller_id: 7, buyer_cms_user_id: "other-buyer" }]],
        ["has no buyer identity", [{ id: 42, seller_id: 7, buyer_cms_user_id: null }]],
    ] as const) {
        test(`returns the same not-found contract when the order ${label}`, async () => {
            useSellerContextData({ orders: [...orders] });

            const response = await requestCommerce(paymentRoute, {
                userId: buyerCmsUserId,
                body: { orderId: 42 },
            });

            expect(await responseBody(response)).toEqual([404, { error: "order not found" }]);
            expectDatabaseReads(["orders"]);
        });
    }

    for (const [label, sellers] of [
        ["absent", []],
        ["not a user", [{ id: 7, kind: "organization", cms_user_id: sellerCmsUserId }]],
        ["missing its CMS user id", [{ id: 7, kind: "user", cms_user_id: null }]],
    ] as const) {
        test(`rejects a seller that is ${label} after exactly two reads`, async () => {
            useSellerContextData({ sellers: [...sellers] });

            const response = await requestCommerce(paymentRoute, {
                userId: buyerCmsUserId,
                body: { orderId: 42 },
            });

            expect(await responseBody(response)).toEqual([
                409,
                { error: "protected marketplace seller identity is unavailable" },
            ]);
            expectDatabaseReads(["orders", "sellers"]);
        });
    }
});
