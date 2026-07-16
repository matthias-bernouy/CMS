import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce product detail baseline budgets", () => {
    test("records eight database calls for the complete administrator detail", async () => {
        useProductResponder();

        const response = await requestCommerce("/admin/product?id=42", { userRole: null });

        expect(response.status).toBe(200);
        expectResources([
            "products",
            "product_variant_axes",
            "product_variant_axis_values",
            "product_variants",
            "product_variant_selections",
            "product_media",
            "brands",
            "product_categories",
        ]);
    });

    test("records nine database calls for the complete public detail", async () => {
        useProductResponder();

        const response = await requestCommerce("/product?id=42");

        expect(response.status).toBe(200);
        expectResources([
            "products",
            "custom_field_definitions",
            "product_variant_axes",
            "product_variant_axis_values",
            "product_variants",
            "product_variant_selections",
            "product_media",
            "brands",
            "product_categories",
        ]);
    });

    test("skips only the brand lookup when the product has no brand", async () => {
        useProductResponder({ brandId: null });

        const response = await requestCommerce("/admin/product?id=42");

        expect(response.status).toBe(200);
        expectResources([
            "products",
            "product_variant_axes",
            "product_variant_axis_values",
            "product_variants",
            "product_variant_selections",
            "product_media",
            "product_categories",
        ]);
    });

    test("requests every ordered relation with its historical query contract", async () => {
        useProductResponder();

        await requestCommerce("/admin/product?id=42");
        const calls = capturedFetches().slice(1);
        const params = new Map(calls.map(call => {
            const url = new URL(call.url);
            return [url.pathname.split("/").at(-1), url.searchParams];
        }));

        expect(params.get("product_variant_axes")?.get("order")).toBe("position.asc,id.asc");
        expect(params.get("product_variant_axis_values")?.get("order")).toBe("position.asc,id.asc");
        expect(params.get("product_variants")?.get("order")).toBe("position.asc,id.asc");
        expect(params.get("product_variant_selections")?.get("order")).toBeNull();
        expect(params.get("product_media")?.get("order")).toBe("sort_order.asc,id.asc");
        expect(params.get("product_categories")?.get("order"))
            .toBe("is_primary.desc,position.asc,category_id.asc");
        expect(calls.every(call => call.method === "GET" && call.headers.get("apikey") === "sb_secret_test"))
            .toBeTrue();
    });
});

function expectResources(expected: string[]): void {
    const calls = capturedFetches();
    expect(calls).toHaveLength(expected.length);
    expect(calls.map(call => new URL(call.url).pathname.split("/").at(-1))).toEqual(expected);
}
