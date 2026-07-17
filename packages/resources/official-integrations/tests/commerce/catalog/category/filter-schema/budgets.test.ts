import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { useFilterSchemaResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer filter schema baseline budget", () => {
    test("records the schema RPC followed by the bounded active-brand read", async () => {
        useFilterSchemaResponder();

        const response = await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(calls.map(call => new URL(call.url).pathname.split("/").at(-1))).toEqual([
            "offer_filter_schema",
            "brands",
        ]);
        expect(expectRpc("offer_filter_schema").body).toEqual({
            p_category_full_slug: "sports/tennis",
        });
        const brands = new URL(calls[1]!.url).searchParams;
        expect(brands.get("select")).toBe("id,slug,name");
        expect(brands.get("status")).toBe("eq.active");
        expect(brands.get("order")).toBe("name.asc,id.asc");
        expect(brands.get("limit")).toBe("200");
    });

    test("uses the secret service-role transport for both baseline reads", async () => {
        useFilterSchemaResponder();

        await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");
        const [schema, brands] = capturedFetches();

        expect(schema!.headers.get("apikey")).toBe("sb_secret_test");
        expect(schema!.headers.get("authorization")).toBeNull();
        expect(schema!.headers.get("accept-profile")).toBe("commerce");
        expect(schema!.headers.get("content-profile")).toBe("commerce");
        expect(brands!.headers.get("apikey")).toBe("sb_secret_test");
        expect(brands!.headers.get("authorization")).toBeNull();
        expect(brands!.headers.get("accept-profile")).toBe("commerce");
        expect(brands!.headers.get("content-profile")).toBeNull();
    });
});
