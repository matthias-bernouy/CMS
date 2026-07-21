import { afterEach, describe, expect, test } from "bun:test";
import { P9rInput, Button, Combobox, P9rSelect } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-detail/WDetail";

if (!customElements.get("p9r-input")) {
    customElements.define("p9r-input", P9rInput);
}
if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}
if (!customElements.get("p9r-combobox")) {
    customElements.define("p9r-combobox", Combobox);
}
if (!customElements.get("p9r-select")) {
    customElements.define("p9r-select", P9rSelect);
}

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail widget actions", () => {
    test("keeps independent lookup options when a dependent lookup fails", async () => {
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            const url = new URL(request.url);
            if (url.pathname.endsWith("/products")) {
                return Response.json({ items: [{ id: "product-1", title: "Racket", slug: "racket" }] });
            }
            if (url.pathname.endsWith("/variants")) {
                return new Response("missing product id", { status: 400 });
            }
            return new Response("unexpected lookup", { status: 500 });
        }) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "offerDetail",
                source: { endpoint: "offer", params: { id: "$selection.id" } },
                title: { path: "title", fallback: "Offer" },
                main: [
                    {
                        id: "details",
                        title: "Details",
                        fields: [
                            {
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
                            },
                            {
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
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute("data-source-json", JSON.stringify({ id: "offer-1", productId: "", variantId: "" }));
        detail.setAttribute("data-row-key", "offer-1");
        detail.setAttribute("data-source-id", "offers");

        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox option[value='product-1']")));

        expect(detail.shadowRoot!.querySelector("p9r-combobox option[value='product-1']")?.textContent).toBe("Racket");
        expect(detail.shadowRoot!.querySelector("p9r-combobox option[value='variant-1']")).toBeNull();
    });

    test("keeps media items when lookup options rerender current fields", async () => {
        globalThis.fetch = (async (_input, _init) =>
            Response.json({
                items: [{ id: "brand-1", name: "Acme", slug: "acme" }],
            })) as typeof fetch;

        const detail = document.createElement("cms-dashboard-w-detail");
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product", params: { id: "$selection.id" } },
                title: { path: "title", fallback: "Product" },
                main: [
                    {
                        id: "media",
                        title: "Media",
                        fields: [
                            {
                                id: "media",
                                label: "Media",
                                path: "media",
                                type: "media",
                                multiple: true,
                                item: {
                                    idPath: "media.id",
                                    urlPath: "media.url",
                                    altPath: "media.alt",
                                },
                                actions: {
                                    upload: { endpoint: "uploadProductImage", params: { productId: "$resource.id" } },
                                },
                            },
                        ],
                    },
                    {
                        id: "organization",
                        title: "Organization",
                        fields: [
                            {
                                id: "brandId",
                                label: "Brand",
                                path: "brandId",
                                type: "combobox",
                                lookup: {
                                    endpoint: "brands",
                                    params: { q: "$search", limit: "20" },
                                    itemsPath: "items",
                                    valuePath: "id",
                                    labelPath: "name",
                                },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({
                id: 2,
                title: "Poster",
                brandId: "brand-1",
                media: [{ media: { id: 10, url: null, alt: "Poster front" } }],
            }),
        );
        detail.setAttribute("data-row-key", "2");
        detail.setAttribute("data-source-id", "products");

        document.body.append(detail);
        await waitFor(() => Boolean(detail.shadowRoot!.querySelector("p9r-combobox option[value='brand-1']")));

        const media = detail.shadowRoot!.querySelector("cms-dashboard-w-media-field") as HTMLElement & {
            items: Array<{ id: string; url: string; alt?: string }>;
        };
        expect(media.items).toEqual([
            {
                id: "10",
                url: "/.cms/sources/products/productImage?id=10",
                alt: "Poster front",
            },
        ]);
    });
});

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let i = 0; i < tries; i += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(predicate()).toBe(true);
}
