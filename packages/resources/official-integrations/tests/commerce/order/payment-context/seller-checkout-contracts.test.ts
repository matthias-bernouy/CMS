import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    buyerCmsUserId,
    checkoutRoute,
    expectSellerContextRpc,
    responseBody,
    sellerCmsUserId,
    sellerContextResult,
    useSellerContextResponse,
} from "./seller-context-fixtures";

installCommerceTestEnvironment();

describe("commerce protected-checkout seller context contracts", () => {
    test("returns only normalized identities through one bounded RPC", async () => {
        useSellerContextResponse(
            sellerContextResult({
                seller_cms_user_id: `  ${sellerCmsUserId}  `,
                offer_price: 9_999,
                seller_email: "seller-private@example.test",
                seller_address: { line1: "must not leak" },
                stripe_account_id: "acct_must_not_leak",
            }),
        );

        const response = await requestCommerce(checkoutRoute, {
            userId: `  ${buyerCmsUserId}  `,
            body: {
                items: [{ offerId: "91" }, { offerId: 92 }, { offerId: 91 }],
            },
        });

        expect(await responseBody(response)).toEqual([200, { sellerCmsUserId, buyerCmsUserId }]);
        expectSellerContextRpc({
            p_scope: "checkout",
            p_offer_ids: [91, 92],
            p_order_id: null,
            p_buyer_cms_user_id: buyerCmsUserId,
            p_price_agreement_public_id: null,
        });
    });

    for (const [state, status, error] of [
        ["offer_not_found", 404, "offer not found"],
        ["multiple_sellers", 409, "one protected order cannot contain multiple sellers"],
        ["seller_unavailable", 409, "protected marketplace seller identity is unavailable"],
    ] as const) {
        test(`maps ${state} without exposing database details`, async () => {
            useSellerContextResponse({ state, private_details: "must not leak" });

            const response = await requestCommerce(checkoutRoute, {
                userId: buyerCmsUserId,
                body: { items: [{ offerId: 91 }, { offerId: 92 }] },
            });

            expect(await responseBody(response)).toEqual([status, { error }]);
            expectSellerContextRpc({
                p_scope: "checkout",
                p_offer_ids: [91, 92],
                p_order_id: null,
                p_buyer_cms_user_id: buyerCmsUserId,
                p_price_agreement_public_id: null,
            });
        });
    }
});
