import { describe, expect, test } from "bun:test";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useFilterSchemaResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized offer filter schema budget", () => {
    test("loads the schema and bounded active brands in one database call", async () => {
        useFilterSchemaResponder();

        const response = await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls.map((call) => new URL(call.url).pathname.split("/").at(-1))).toEqual([
            "get_offer_filter_schema_read_model",
        ]);
        expect(expectRpc("get_offer_filter_schema_read_model").body).toEqual({
            p_category_full_slug: "sports/tennis",
        });
    });

    test("uses the secret service-role transport for the private read model", async () => {
        useFilterSchemaResponder();

        await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");
        const [readModel] = capturedFetches();

        expect(readModel!.headers.get("apikey")).toBe("sb_secret_test");
        expect(readModel!.headers.get("authorization")).toBeNull();
        expect(readModel!.headers.get("accept-profile")).toBe("commerce");
        expect(readModel!.headers.get("content-profile")).toBe("commerce");
    });
});
