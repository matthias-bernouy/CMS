import { describe, expect, test } from "bun:test";
import {
    expectSingleRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

describe("commerce offer estimate requests", () => {
    test("returns an aggregate without exposing comparable offers", async () => {
        setRestResponder(() =>
            jsonResponse({
                available: true,
                currency: "eur",
                scope: "variant_and_condition",
                sampleSize: 8,
                observedMinimumAmount: 12000,
                observedMaximumAmount: 17500,
                medianAmount: 14900,
                estimatedMinimumAmount: 13500,
                estimatedMaximumAmount: 16000,
            }),
        );

        const response = await requestCommerce("/offer-estimate?productId=42&variantId=9&conditionCode=good");

        expect(response.status).toBe(200);
        expect(await response.json()).not.toHaveProperty("items");
        expect(expectSingleRpc("estimate_offer_price").body).toEqual({
            p_product_id: 42,
            p_variant_id: 9,
            p_condition_code: "good",
        });
    });
});
