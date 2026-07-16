import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { newProduct, productRow } from "./expected";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce product detail boundaries", () => {
    test("returns the local administrator template without database work", async () => {
        const response = await requestCommerce("/admin/product?id=__new__", { userRole: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(newProduct);
        expect(capturedFetches()).toEqual([]);
    });

    test("rejects missing and invalid selectors before database work", async () => {
        const missing = await requestCommerce("/product");
        const invalid = await requestCommerce("/admin/product?id=invalid", { userRole: null });

        expect(missing.status).toBe(400);
        expect(await missing.json()).toEqual({ error: "id or slug is required" });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toEqual({ error: "id must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });

    test("does not treat the public new-product selector as a template", async () => {
        const response = await requestCommerce("/product?id=__new__");

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "id or slug is required" });
        expect(capturedFetches()).toEqual([]);
    });

    test("returns a missing product before any enrichment read", async () => {
        useProductResponder({ product: null });

        const response = await requestCommerce("/admin/product?id=404", { userRole: null });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "product not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    for (const field of ["status", "visibility"] as const) {
        test(`conceals a public product whose ${field} is not readable`, async () => {
            useProductResponder({
                product: {
                    ...productRow,
                    [field]: field === "status" ? "draft" : "private",
                },
            });

            const response = await requestCommerce("/product?id=42");

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: "product not found" });
            expect(capturedFetches()).toHaveLength(1);
        });
    }

    test("uses id before slug when both selectors are present", async () => {
        useProductResponder();

        const response = await requestCommerce("/admin/product?id=42&slug=ignored");
        const query = new URL(capturedFetches()[0]!.url).searchParams;

        expect(response.status).toBe(200);
        expect(query.get("id")).toBe("eq.42");
        expect(query.get("slug")).toBeNull();
    });

    test("rejects an invalid CMS key before templates, selectors, or reads", async () => {
        const response = await requestCommerce("/admin/product?id=__new__", {
            authenticated: false,
            userRole: null,
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid CMS API key" });
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves PostgREST product-read failures", async () => {
        setRestResponder(() => jsonResponse({ message: "database unavailable" }, 503));

        const response = await requestCommerce("/product?id=42");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "database unavailable" });
        expect(capturedFetches()).toHaveLength(1);
    });
});
