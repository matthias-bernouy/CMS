import { describe, expect, test } from "bun:test";
import {
    executeSellerPrice,
    expectGenericFailure,
} from "../harness";
import { offerResult } from "../fixtures";
import { privateFailure, sellerPriceResponder } from "../responders";

describe("Commerce Stripe seller price response boundaries", () => {
    test("normalizes every final Commerce refusal", async () => {
        for (const status of [400, 403, 404, 409, 422]) {
            const { response, calls } = await executeSellerPrice(
                sellerPriceResponder({
                    result: privateFailure(status, "private Commerce detail"),
                }),
            );

            await expectGenericFailure(response);
            expect(calls.map(call => call.url.pathname)).toEqual([
                "/seller", "/status", "/enrollment", "/offer/price",
            ]);
        }
    });

    test("preserves the final 500 for an incomplete success projection", async () => {
        for (const result of [{}, { offer: {} }, { proposal: {} }]) {
            const { response, calls } = await executeSellerPrice(
                sellerPriceResponder({ result }),
            );

            await expectGenericFailure(response, 500);
            expect(calls).toHaveLength(4);
        }
    });

    test("strips undeclared Commerce internals from a successful response", async () => {
        const { response } = await executeSellerPrice(sellerPriceResponder({
            result: {
                ...offerResult,
                providerAccountId: "acct_private",
                offer: {
                    ...offerResult.offer,
                    sellerCmsUserId: "private-seller-subject",
                },
                proposal: {
                    ...offerResult.proposal,
                    internalReviewReason: "private risk signal",
                },
            },
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(offerResult);
    });
});
