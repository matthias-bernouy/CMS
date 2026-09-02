import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { categoryRow, newCategory } from "./expected";
import { useCategoryResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce category detail boundaries", () => {
    test("returns the local administrator template without database work", async () => {
        const response = await requestCommerce("/admin/category?id=__new__", { userRole: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(newCategory);
        expect(capturedFetches()).toEqual([]);
    });

    test("rejects missing and invalid selectors before database work", async () => {
        const missing = await requestCommerce("/category");
        const invalid = await requestCommerce("/admin/category?id=invalid&fullSlug=sports%2Ftennis", {
            userRole: null,
        });

        expect(missing.status).toBe(400);
        expect(await missing.json()).toEqual({ error: "id or fullSlug is required" });
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toEqual({ error: "id must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });

    test("does not treat the public new-category selector as a template", async () => {
        const response = await requestCommerce("/category?id=__new__");

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "id or fullSlug is required" });
        expect(capturedFetches()).toEqual([]);
    });

    test("uses fullSlug for the public __new__ sentinel but keeps the admin template local", async () => {
        useCategoryResponder();

        const publicResponse = await requestCommerce("/category?id=__new__&fullSlug=sports%2Ftennis");
        const publicCalls = capturedFetches();
        const admin = await requestCommerce("/admin/category?id=__new__&fullSlug=sports%2Ftennis", { userRole: null });

        expect(publicResponse.status).toBe(200);
        expect(publicCalls[0]!.body).toEqual({
            p_scope: "public",
            p_category_id: null,
            p_full_slug: "sports/tennis",
        });
        expect(admin.status).toBe(200);
        expect(await admin.json()).toEqual(newCategory);
        expect(capturedFetches()).toHaveLength(publicCalls.length);
    });

    test("returns a missing category before parent or field reads", async () => {
        useCategoryResponder({ category: null });

        const response = await requestCommerce("/admin/category?id=404", { userRole: null });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "category not found" });
        expect(capturedFetches()).toHaveLength(1);
    });

    for (const status of ["inactive", "archived"] as const) {
        test(`conceals a public ${status} category before relation reads`, async () => {
            useCategoryResponder({ category: { ...categoryRow, status } });

            const response = await requestCommerce("/category?id=9");

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({ error: "category not found" });
            expect(capturedFetches()).toHaveLength(1);
        });

        test(`keeps an administrator ${status} category readable without a CMS role`, async () => {
            useCategoryResponder({ category: { ...categoryRow, status } });

            const response = await requestCommerce("/admin/category?id=9", { userRole: null });
            const body = (await response.json()) as Record<string, unknown>;

            expect(response.status).toBe(200);
            expect(body.status).toBe(status);
            expect(capturedFetches()).toHaveLength(1);
        });
    }

    test("uses id before fullSlug when both selectors are present", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/admin/category?id=9&fullSlug=ignored");
        const call = capturedFetches()[0]!;

        expect(response.status).toBe(200);
        expect(call.body).toEqual({
            p_scope: "admin",
            p_category_id: 9,
            p_full_slug: null,
        });
    });

    test("rejects an invalid CMS key before templates, selectors, or reads", async () => {
        const response = await requestCommerce("/admin/category?id=__new__", {
            authenticated: false,
            userRole: null,
        });

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid CMS API key" });
        expect(capturedFetches()).toEqual([]);
    });

    test("preserves database category-read failures", async () => {
        setRestResponder(() => jsonResponse({ message: "database failure" }, 503));

        const response = await requestCommerce("/admin/category?id=9");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "database failure" });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("fails closed when the private read model is malformed", async () => {
        setRestResponder(() =>
            jsonResponse({
                state: "ok",
                category: categoryRow,
                parent: null,
                category_fields: [null],
            }),
        );

        const response = await requestCommerce("/category?id=9");

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "get_category_read_model returned an invalid response",
        });
        expect(capturedFetches()).toHaveLength(1);
    });

    test("preserves routing method refusal without database work", async () => {
        const response = await requestCommerce("/category?id=9", { method: "POST" });

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, OPTIONS");
        expect(await response.text()).toBe("Method Not Allowed");
        expect(capturedFetches()).toEqual([]);
    });
});
