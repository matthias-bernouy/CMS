import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { detailLookupOptions } from "cms-control/components/admin/Resources/Dashboards/runtime/lookups";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("dashboard runtime lookups", () => {
    test("loads lookup options from an explicit source id", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({ items: [{ id: "product-1", title: "Racket" }] });
        }) as typeof fetch;

        const options = await detailLookupOptions("offers", offerDetailWidget([{
            id: "productId",
            label: "Product",
            path: "productId",
            type: "combobox",
            lookup: {
                sourceId: "products",
                endpoint: "products",
                params: { q: "$search", limit: "20" },
                itemsPath: "items",
                valuePath: "id",
                labelPath: "title",
            },
        }]), { id: "offer-1" }, {});

        expect(requests[0]?.url).toContain("/.cms/sources/products/products");
        expect(options.productId).toEqual([{ value: "product-1", label: "Racket" }]);
    });

    test("skips a dependent lookup until its field parameter is available", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            const url = new URL(request.url);
            if (url.pathname.endsWith("/products")) return Response.json({ items: [{ id: "product-1", title: "Racket" }] });
            if (url.pathname.endsWith("/variants")) return Response.json({ items: [{ id: "variant-1", title: "L2" }] });
            return new Response("unexpected lookup", { status: 500 });
        }) as typeof fetch;

        const options = await detailLookupOptions("offers", offerDetailWidget([
            {
                id: "productId",
                label: "Product",
                path: "productId",
                type: "combobox",
                lookup: {
                    sourceId: "products",
                    endpoint: "products",
                    itemsPath: "items",
                    valuePath: "id",
                    labelPath: "title",
                },
            },
            {
                id: "variantId",
                label: "Variant",
                path: "variantId",
                type: "combobox",
                lookup: {
                    sourceId: "products",
                    endpoint: "variants",
                    params: { productId: "$field.productId" },
                    itemsPath: "items",
                    valuePath: "id",
                    labelPath: "title",
                },
            },
        ]), { id: "offer-1" }, { productId: "" });

        expect(options.productId).toEqual([{ value: "product-1", label: "Racket" }]);
        expect(options.variantId).toEqual([]);
        expect(requests.map(request => new URL(request.url).pathname)).toEqual([
            "/.cms/sources/products/products",
        ]);
    });

    test("loads a dependent lookup once its field parameter is available", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({ items: [{ id: "variant-1", title: "L2" }] });
        }) as typeof fetch;

        const options = await detailLookupOptions("offers", offerDetailWidget([{
            id: "variantId",
            label: "Variant",
            path: "variantId",
            type: "combobox",
            lookup: {
                sourceId: "products",
                endpoint: "variants",
                params: { productId: "$field.productId", q: "$search", limit: "20" },
                itemsPath: "items",
                valuePath: "id",
                labelPath: "title",
            },
        }]), { id: "offer-1", productId: "product-1" }, { productId: "product-1" });

        expect(requests).toHaveLength(1);
        expect(new URL(requests[0]!.url).searchParams.toString()).toBe("productId=product-1&limit=20");
        expect(options.variantId).toEqual([{ value: "variant-1", label: "L2" }]);
    });
});

function offerDetailWidget(
    fields: Extract<DashboardWidget, { widget: "w-detail" }>["main"][number]["fields"],
): Extract<DashboardWidget, { widget: "w-detail" }> {
    return {
        widget: "w-detail",
        id: "offerDetail",
        source: { endpoint: "offer", params: { id: "$selection.id" } },
        main: [{ id: "details", title: "Details", fields }],
    };
}
