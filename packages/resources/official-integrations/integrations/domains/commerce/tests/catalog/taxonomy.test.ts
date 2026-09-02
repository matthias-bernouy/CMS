import { describe, expect, test } from "bun:test";
import { expectRpc, installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

describe("commerce catalogue taxonomy", () => {
    test("lists public brands and hierarchical categories", async () => {
        setRestResponder((request) => {
            const url = new URL(request.url);
            const table = url.pathname.split("/").at(-1);
            if (table === "brands") {
                expect(url.searchParams.get("status")).toBe("eq.active");
                return jsonResponse([{ id: 1, slug: "wilson", name: "Wilson", status: "active" }], 200, {
                    "content-range": "0-0/1",
                });
            }
            if (table === "categories") {
                expect(url.searchParams.get("parent_id")).toBe("is.null");
                return jsonResponse(
                    [{ id: 2, slug: "rackets", full_slug: "rackets", label: "Rackets", status: "active" }],
                    200,
                    { "content-range": "0-0/1" },
                );
            }
            return jsonResponse([]);
        });

        const brands = await (await requestCommerce("/brands")).json();
        const categories = await (await requestCommerce("/categories?parentId=root")).json();
        expect(brands).toMatchObject({ total: 1, items: [{ slug: "wilson", name: "Wilson" }] });
        expect(categories).toMatchObject({ total: 1, items: [{ fullSlug: "rackets", label: "Rackets" }] });
    });

    test("maps administrator taxonomy writes to versioned RPCs", async () => {
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/upsert_brand")) {
                return jsonResponse({ id: 7, slug: "babolat", name: "Babolat", version: 1 });
            }
            return jsonResponse({
                id: 9,
                parent_id: 2,
                slug: "tennis",
                full_slug: "rackets/tennis",
                label: "Tennis",
                version: 1,
            });
        });

        await requestCommerce("/admin/brand", { body: { slug: "babolat", name: "Babolat" } });
        await requestCommerce("/admin/category", { body: { parentId: 2, slug: "tennis", label: "Tennis" } });
        expect(expectRpc("upsert_brand").body.p_payload).toMatchObject({ slug: "babolat", name: "Babolat" });
        expect(expectRpc("upsert_category").body.p_payload).toMatchObject({
            parentId: 2,
            slug: "tennis",
            label: "Tennis",
        });
    });

    test("maps navigation-list ordering to trusted taxonomy commands", async () => {
        setRestResponder(async (request) => jsonResponse(JSON.parse(request.body ? await request.text() : "{}")));

        await requestCommerce("/admin/brands/reorder", { body: { ids: [7, 3] } });
        await requestCommerce("/admin/categories/reorder", { body: { ids: [9, 2] } });

        expect(expectRpc("reorder_brands").body.p_ids).toEqual([7, 3]);
        expect(expectRpc("reorder_categories").body.p_ids).toEqual([9, 2]);
    });

    test("maps taxonomy deletion to restrictive trusted commands", async () => {
        setRestResponder((request) => {
            const path = new URL(request.url).pathname;
            return jsonResponse(
                path.endsWith("/rpc/delete_brand") ? { id: 7, deleted: true } : { id: 9, deleted: true },
            );
        });

        const brand = await requestCommerce("/admin/brand?id=7", { method: "DELETE" });
        const category = await requestCommerce("/admin/category?id=9", { method: "DELETE" });

        expect(brand.status).toBe(200);
        expect(category.status).toBe(200);
        expect(expectRpc("delete_brand").body).toEqual({ p_brand_id: 7 });
        expect(expectRpc("delete_category").body).toEqual({ p_category_id: 9 });
    });

    test("synchronizes the Product metadata policies selected by a category", async () => {
        setRestResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/rpc/upsert_category")) {
                return jsonResponse({
                    id: 9,
                    slug: "tennis",
                    full_slug: "rackets/tennis",
                    label: "Tennis",
                    version: 2,
                });
            }
            if (path.endsWith("/rpc/sync_category_custom_fields")) {
                return jsonResponse({ fields: [{ field_key: "grip", required: true, filterable: true, position: 0 }] });
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/admin/category?id=9", {
            body: {
                expectedVersion: 1,
                slug: "tennis",
                label: "Tennis",
                categoryFields: [
                    {
                        fieldKey: "grip",
                        required: "true",
                        filterable: "true",
                        unit: "",
                        operators: "eq, in",
                    },
                ],
            },
        });

        expect(response.status).toBe(200);
        expect(expectRpc("sync_category_custom_fields").body).toEqual({
            p_category_id: 9,
            p_fields: [
                {
                    fieldKey: "grip",
                    required: true,
                    filterable: true,
                    position: 0,
                },
            ],
        });
        expect(await response.json()).toMatchObject({
            categoryFields: [{ fieldKey: "grip", required: true, filterable: true }],
        });
    });

    test("returns the inherited category schema used by Product dashboards", async () => {
        setRestResponder((request) => {
            expect(new URL(request.url).pathname).toEndWith("/rpc/category_custom_field_schema");
            return jsonResponse({ fields: [{ id: "grip", path: "metadata.grip", type: "select", inherited: true }] });
        });

        const response = await requestCommerce("/admin/category-product-fields?categoryId=9");

        expect(expectRpc("category_custom_field_schema").body).toEqual({ p_category_id: 9 });
        expect(await response.json()).toEqual({
            fields: [{ id: "grip", path: "metadata.grip", type: "select", inherited: true }],
        });
    });
});
