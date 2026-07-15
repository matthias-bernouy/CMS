import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardField, DashboardWidget } from "@bernouy/cms-dashboards";
import { detailLookupOptions } from "cms-control/components/admin/Resources/Dashboards/runtime/lookups";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("dashboard local lookup selections", () => {
    test("maps an embedded selected resource without a hydration request", async () => {
        const requests: Request[] = [];
        globalThis.fetch = respondingWith({ items: [] }, requests);

        const options = await detailLookupOptions("catalog", detailWidget([lookupField({
            selected: "$resource.product",
        })]), {
            productId: "product-1",
            product: { id: "product-1", title: "Racket" },
        }, { productId: "product-1" });

        expect(options.productId).toEqual([{ value: "product-1", label: "Racket" }]);
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toContain("/.cms/sources/catalog/products");
    });

    test("keeps the embedded selection when the option page fails", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            requests.push(new Request(input, init));
            return new Response("temporarily unavailable", { status: 503 });
        }) as typeof fetch;

        const options = await detailLookupOptions("catalog", detailWidget([lookupField({
            selected: "$resource.product",
        })]), {
            product: { id: "product-1", title: "Racket" },
        }, { productId: "product-1" });

        expect(options.productId).toEqual([{ value: "product-1", label: "Racket" }]);
        expect(requests).toHaveLength(1);
    });

    test("maps selected arrays and deduplicates the fetched option page", async () => {
        globalThis.fetch = respondingWith({
            items: [{ id: "tag-a", title: "Fresh A" }],
        });
        const field = lookupField({ selected: "$resource.selectedTags" });
        field.id = "tagIds";
        field.path = "tagIds";
        field.type = "tokens";

        const options = await detailLookupOptions("catalog", detailWidget([field]), {
            selectedTags: [
                { id: "tag-a", title: "Snapshot A" },
                { id: "tag-b", title: "Snapshot B" },
                { id: "tag-b", title: "Duplicate B" },
            ],
        }, { tagIds: ["tag-a", "tag-b"] });

        expect(options.tagIds).toEqual([
            { value: "tag-a", label: "Fresh A" },
            { value: "tag-b", label: "Snapshot B" },
        ]);
    });

    test("ignores stale, unlabeled, and legacy selected values", async () => {
        const requests: Request[] = [];
        globalThis.fetch = respondingWith({ items: [] }, requests);
        const fields = [
            lookupField({ selected: "$resource.wrongProduct" }),
            { ...lookupField({ selected: "$resource.unlabeledProduct" }), id: "otherId", path: "otherId" },
            { ...lookupField(), id: "legacyId", path: "legacyId", lookup: {
                ...lookupField().lookup!,
                selected: { endpoint: "product", params: { id: "$value" } },
            } },
        ] as DashboardField[];

        const options = await detailLookupOptions("catalog", detailWidget(fields), {
            wrongProduct: { id: "other", title: "Wrong" },
            unlabeledProduct: { id: "product-2" },
        }, { productId: "product-1", otherId: "product-2", legacyId: "product-3" });

        expect(options).toEqual({ productId: [], otherId: [], legacyId: [] });
        expect(requests).toHaveLength(3);
    });
});

function lookupField(overrides: Record<string, unknown> = {}): Extract<DashboardField, { type: "combobox" | "tokens" }> {
    return {
        id: "productId",
        label: "Product",
        path: "productId",
        type: "combobox",
        lookup: {
            endpoint: "products",
            itemsPath: "items",
            valuePath: "id",
            labelPath: "title",
            ...overrides,
        },
    } as Extract<DashboardField, { type: "combobox" | "tokens" }>;
}

function detailWidget(fields: DashboardField[]): Extract<DashboardWidget, { widget: "w-detail" }> {
    return {
        widget: "w-detail",
        id: "detail",
        source: { endpoint: "resource" },
        main: [{ id: "main", title: "Main", fields }],
    };
}

function respondingWith(data: unknown, requests: Request[] = []): typeof fetch {
    return (async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(data);
    }) as typeof fetch;
}
