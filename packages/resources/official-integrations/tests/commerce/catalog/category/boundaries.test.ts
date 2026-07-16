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
        const invalid = await requestCommerce(
            "/admin/category?id=invalid&fullSlug=sports%2Ftennis",
            { userRole: null },
        );

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
        const admin = await requestCommerce(
            "/admin/category?id=__new__&fullSlug=sports%2Ftennis",
            { userRole: null },
        );

        expect(publicResponse.status).toBe(200);
        expect(new URL(publicCalls[0]!.url).searchParams.get("full_slug"))
            .toBe("eq.sports/tennis");
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
            const body = await response.json() as Record<string, unknown>;

            expect(response.status).toBe(200);
            expect(body.status).toBe(status);
            expect(capturedFetches()).toHaveLength(3);
        });
    }

    test("uses id before fullSlug when both selectors are present", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/admin/category?id=9&fullSlug=ignored");
        const params = new URL(capturedFetches()[0]!.url).searchParams;

        expect(response.status).toBe(200);
        expect(params.get("id")).toBe("eq.9");
        expect(params.get("full_slug")).toBeNull();
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

    test("preserves database failures from each sequential category read", async () => {
        for (const failingCall of [1, 2, 3]) {
            const previousCalls = capturedFetches().length;
            let calls = 0;
            setRestResponder(request => {
                calls += 1;
                if (calls === failingCall) return jsonResponse({ message: `database failure ${failingCall}` }, 503);
                const resource = new URL(request.url).pathname.split("/").at(-1);
                if (resource === "categories") {
                    const parent = new URL(request.url).searchParams.get("select") === "id,slug,full_slug,label,status";
                    return jsonResponse([parent ? {
                        id: 3, slug: "sports", full_slug: "sports", label: "Sports", status: "active",
                    } : categoryRow]);
                }
                return jsonResponse([]);
            });

            const response = await requestCommerce("/admin/category?id=9");

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({ error: `database failure ${failingCall}` });
            expect(capturedFetches()).toHaveLength(previousCalls + failingCall);
        }
    });

    test("preserves routing method refusal without database work", async () => {
        const response = await requestCommerce("/category?id=9", { method: "POST" });

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, OPTIONS");
        expect(await response.text()).toBe("Method Not Allowed");
        expect(capturedFetches()).toEqual([]);
    });
});
