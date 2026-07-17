import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { useFilterSchemaResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer filter schema boundaries", () => {
    test("rejects a missing or blank category before database work", async () => {
        const missing = await requestCommerce("/offer-filter-schema");
        const blank = await requestCommerce("/offer-filter-schema?category=%20%20");

        expect(missing.status).toBe(400);
        expect(await missing.json()).toEqual({ error: "category is required" });
        expect(blank.status).toBe(400);
        expect(await blank.json()).toEqual({ error: "category is required" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns a missing category from the single read model", async () => {
        useFilterSchemaResponder({ schema: null });

        const response = await requestCommerce("/offer-filter-schema?category=missing");

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "category not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("trims the category before calling the schema RPC", async () => {
        useFilterSchemaResponder();

        const response = await requestCommerce(
            "/offer-filter-schema?category=%20sports%2Ftennis%20",
        );

        expect(response.status).toBe(200);
        expect(capturedFetches()[0]!.body).toEqual({
            p_category_full_slug: "sports/tennis",
        });
    });

    test("rejects an invalid CMS key before validation or reads", async () => {
        const response = await requestCommerce("/offer-filter-schema", {
            authenticated: false,
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid CMS API key" });
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves database failure mapping from the single read model", async () => {
        setRestResponder(() => jsonResponse({ message: "database failure" }, 503));

        const response = await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "database failure" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("preserves routing method refusal without database work", async () => {
        const response = await requestCommerce("/offer-filter-schema?category=sports", {
            method: "POST",
        });

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, OPTIONS");
        expect(await response.text()).toBe("Method Not Allowed");
        expect(capturedFetches()).toEqual([]);
    });
});
