import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { productRow } from "./expected";

installCommerceTestEnvironment();

describe("commerce product list contracts and baseline budgets", () => {
    test("preserves the administrator list, filters, exact total, and one-call budget", async () => {
        setRestResponder(() => jsonResponse([productRow], 200, { "content-range": "3-3/7" }));

        const response = await requestCommerce(
            "/admin/products?limit=2&offset=3&status=draft&visibility=private&q=racket",
            { userRole: null },
        );
        const body = await response.json();
        const calls = capturedFetches();
        const query = new URL(calls[0]!.url).searchParams;

        expect(response.status).toBe(200);
        expect(body).toEqual({
            items: [
                {
                    id: 42,
                    slug: "racket-pro",
                    title: "Racket Pro",
                    description: null,
                    brandId: 7,
                    status: "active",
                    visibility: "public",
                    metadata: { publicSpec: "graphite", privateCost: 12000, snake_key: "opaque" },
                    version: 3,
                    createdAt: "2026-07-01T10:00:00Z",
                    updatedAt: "2026-07-04T10:00:00Z",
                },
            ],
            total: 7,
            limit: 2,
            offset: 3,
        });
        expect(calls).toHaveLength(1);
        expect(query.get("status")).toBe("eq.draft");
        expect(query.get("visibility")).toBe("eq.private");
        expect(query.get("or")).toBe("(title.ilike.*racket*,slug.ilike.*racket*)");
        expect(query.get("order")).toBe("updated_at.desc,id.desc");
        expect(calls[0]!.headers.get("prefer")).toBe("count=exact");
    });

    test("preserves the redacted public list and two-call budget", async () => {
        setRestResponder((request) => {
            const resource = new URL(request.url).pathname.split("/").at(-1);
            if (resource === "products") {
                return jsonResponse([productRow]);
            }
            if (resource === "custom_field_definitions") {
                return jsonResponse([{ key: "publicSpec" }, { key: "snake_key" }]);
            }
            throw new Error(`Unexpected product-list request: ${request.url}`);
        });

        const response = await requestCommerce("/products?limit=500&offset=-3");
        const body = await response.json();
        const calls = capturedFetches();
        const query = new URL(calls[0]!.url).searchParams;

        expect(response.status).toBe(200);
        expect(body).toEqual({
            items: [
                {
                    id: 42,
                    slug: "racket-pro",
                    title: "Racket Pro",
                    description: null,
                    brandId: 7,
                    status: "active",
                    visibility: "public",
                    metadata: { publicSpec: "graphite", snake_key: "opaque" },
                    version: 3,
                    createdAt: "2026-07-01T10:00:00Z",
                    updatedAt: "2026-07-04T10:00:00Z",
                },
            ],
            total: 0,
            limit: 100,
            offset: 0,
        });
        expect(calls.map((call) => new URL(call.url).pathname.split("/").at(-1))).toEqual([
            "products",
            "custom_field_definitions",
        ]);
        expect(query.get("status")).toBe("eq.active");
        expect(query.get("visibility")).toBe("eq.public");
    });

    test("loads public metadata definitions even for an empty page", async () => {
        setRestResponder((request) =>
            new URL(request.url).pathname.endsWith("/products")
                ? jsonResponse([])
                : jsonResponse([{ key: "publicSpec" }]),
        );

        const response = await requestCommerce("/products");

        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(capturedFetches()).toHaveLength(2);
    });

    test("rejects invalid pagination before any list read", async () => {
        const response = await requestCommerce("/products?limit=invalid");

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "limit must be an integer" });
        expect(capturedFetches()).toEqual([]);
    });
});
