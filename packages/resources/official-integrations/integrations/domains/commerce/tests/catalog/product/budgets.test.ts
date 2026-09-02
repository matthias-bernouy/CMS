import { describe, expect, test } from "bun:test";
import { expectSingleRpc, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce optimized product detail budgets", () => {
    test("loads the complete administrator detail in one database call", async () => {
        useProductResponder();

        const response = await requestCommerce("/admin/product?id=42", { userRole: null });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_product_read_model").body).toEqual({
            p_scope: "admin",
            p_product_id: 42,
            p_slug: null,
        });
    });

    test("loads the complete public detail and metadata policy in one database call", async () => {
        useProductResponder();

        const response = await requestCommerce("/product?slug=racket-pro");

        expect(response.status).toBe(200);
        expect(expectSingleRpc("get_product_read_model").body).toEqual({
            p_scope: "public",
            p_product_id: null,
            p_slug: "racket-pro",
        });
    });

    test("keeps one call when the product has no brand", async () => {
        useProductResponder({ brandId: null });

        const response = await requestCommerce("/admin/product?id=42");

        expect(response.status).toBe(200);
        expectSingleRpc("get_product_read_model");
    });

    test("uses the secret service-role transport for the private read model", async () => {
        useProductResponder();

        await requestCommerce("/admin/product?id=42");
        const call = expectSingleRpc("get_product_read_model");

        expect(call.headers.get("apikey")).toBe("sb_secret_test");
        expect(call.headers.get("authorization")).toBeNull();
        expect(call.headers.get("accept-profile")).toBe("commerce");
        expect(call.headers.get("content-profile")).toBe("commerce");
    });
});
