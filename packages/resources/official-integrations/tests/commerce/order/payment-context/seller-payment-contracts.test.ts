import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    expectSellerContextRpc,
    paymentRoute,
    responseBody,
    sellerCmsUserId,
    sellerContextResult,
    useSellerContextResponse,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

const expectedPaymentBody = {
    p_scope: "payment",
    p_offer_ids: null,
    p_order_id: 42,
    p_buyer_cms_user_id: buyerCmsUserId,
};

describe("commerce protected-payment seller context contracts", () => {
    test("returns only normalized buyer-owned identities through one RPC", async () => {
        useSellerContextResponse(
            sellerContextResult({
                seller_cms_user_id: `  ${sellerCmsUserId}  `,
                shipping_address: { line1: "must not leak" },
                billing_address: { line1: "must not leak" },
                seller_email: "seller-private@example.test",
                stripe_account_id: "acct_must_not_leak",
                seller_proceeds_amount: 8_000,
            }),
        );

        const response = await requestCommerce(paymentRoute, {
            userId: `  ${buyerCmsUserId}  `,
            body: { orderId: "42" },
        });

        expect(await responseBody(response)).toEqual([200, { sellerCmsUserId, buyerCmsUserId }]);
        expectSellerContextRpc(expectedPaymentBody);
    });

    for (const [label, state, status, error] of [
        ["missing order", "order_not_found", 404, "order not found"],
        ["strict stored-buyer mismatch", "order_not_found", 404, "order not found"],
        ["unavailable seller", "seller_unavailable", 409, "protected marketplace seller identity is unavailable"],
    ] as const) {
        test(`preserves the ${label} contract`, async () => {
            useSellerContextResponse({ state, private_details: "must not leak" });

            const response = await requestCommerce(paymentRoute, {
                userId: `  ${buyerCmsUserId}  `,
                body: { orderId: 42 },
            });

            expect(await responseBody(response)).toEqual([status, { error }]);
            expectSellerContextRpc(expectedPaymentBody);
        });
    }

    test("rejects a success context for a different buyer", async () => {
        useSellerContextResponse(sellerContextResult({ buyer_cms_user_id: "other-buyer" }));

        const response = await requestCommerce(paymentRoute, {
            userId: buyerCmsUserId,
            body: { orderId: 42 },
        });

        expect(await responseBody(response)).toEqual([
            502,
            { error: "get_protected_seller_context returned an invalid response" },
        ]);
        expectSellerContextRpc(expectedPaymentBody);
    });
});
