import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { useFilterSchemaResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized offer filter schema budget", () => {
    test("loads the schema, numeric ranges, and bounded active brands in one database call", async () => {
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

    test("scopes brand facets to active public products in the selected category tree", async () => {
        const sql = await readFile(
            resolve(
                import.meta.dir,
                "../../../../../integrations/domains/commerce/versions/1.0.0/connectors/supabase/sql/catalog/taxonomy/offer-filter-schema-read-model.sql",
            ),
            "utf8",
        );

        expect(sql).toContain("category_scope as");
        expect(sql).toContain("catalog_products as materialized");
        expect(sql).toContain("join catalog_products product");
        expect(sql).toContain("category_link.category_id in (select id from category_scope)");
        expect(sql).toContain("product.status = 'active'");
        expect(sql).toContain("product.visibility = 'public'");
        expect(sql).toContain("limit 200");
    });

    test("derives numeric ranges from effective metadata without another database call", async () => {
        const sql = await readFile(
            resolve(
                import.meta.dir,
                "../../../../../integrations/domains/commerce/versions/1.0.0/connectors/supabase/sql/catalog/taxonomy/offer-filter-schema-read-model.sql",
            ),
            "utf8",
        );

        expect(sql).toContain("catalog_products as materialized");
        expect(sql).toContain("left join commerce.product_variants variant");
        expect(sql).toContain("variant.status = 'active'");
        expect(sql).toContain("commerce.effective_variant_metadata(");
        expect(sql).toContain("jsonb_typeof(metadata.value->numeric_field.key) = 'number'");
        expect(sql).toContain("least(max(scale(numeric_value.value)), 6)");
        expect(sql).toContain("numeric_bound.maximum - numeric_bound.minimum");
    });
});
