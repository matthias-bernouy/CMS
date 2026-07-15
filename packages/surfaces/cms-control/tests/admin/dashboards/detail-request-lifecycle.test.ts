import { afterEach, describe, expect, test } from "bun:test";
import { waitForDetail } from "./detailTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard detail request lifecycle", () => {
    test("waits for resolved bound data and shares equivalent lookup and schema requests", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(new Request(input, init));
            return Response.json({
                items: [{ id: "brand-1", name: "Acme" }],
                fields: [{ id: "material", label: "Material", type: "string" }],
            });
        }) as unknown as typeof fetch;
        const detail = detailElement(sharedLookupWidget());
        detail.setAttribute("data-source-json", "{{ dashboardData | json }}");
        detail.setAttribute("data-source-id", "catalog");

        await Promise.resolve();
        expect(requests).toHaveLength(0);
        document.body.append(detail);
        await Promise.resolve();
        expect(requests).toHaveLength(0);

        detail.setAttribute("data-row-key", "product-1");
        detail.setAttribute("data-source-json", JSON.stringify({
            id: "product-1",
            categoryId: "category-1",
            brandId: "brand-1",
            secondaryBrandId: "brand-1",
        }));
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("option[value='brand-1']")));
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='material']")));

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toContain("categoryId=category-1");
    });

    test("does not render a stale response after the detail resource changes", async () => {
        const responses = new Map<string, (response: Response) => void>();
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const ownerId = new URL(String(input)).searchParams.get("ownerId") ?? "";
            return new Promise<Response>(resolve => responses.set(ownerId, resolve));
        }) as unknown as typeof fetch;
        const detail = detailElement(singleLookupWidget());
        detail.setAttribute("data-source-id", "catalog");
        detail.setAttribute("data-row-key", "product");
        detail.setAttribute("data-source-json", JSON.stringify({ id: "product-a", productId: "a" }));
        document.body.append(detail);
        await waitForDetail(() => responses.has("product-a"));

        detail.setAttribute("data-source-json", JSON.stringify({ id: "product-b", productId: "b" }));
        await waitForDetail(() => responses.has("product-b"));
        responses.get("product-b")!(Response.json({ items: [{ id: "b", title: "Product B" }] }));
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("option[value='b']")));

        responses.get("product-a")!(Response.json({ items: [{ id: "a", title: "Product A" }] }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(detail.shadowRoot?.querySelector("option[value='a']")).toBeNull();
        expect(detail.shadowRoot?.querySelector("option[value='b']")?.textContent).toBe("Product B");
    });

    test("aborts and clears stale detail data when a resolved binding becomes invalid", async () => {
        let signal: AbortSignal | undefined;
        globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
            });
        }) as unknown as typeof fetch;
        const detail = detailElement(singleLookupWidget());
        detail.setAttribute("data-source-id", "catalog");
        detail.setAttribute("data-row-key", "product-a");
        detail.setAttribute("data-source-json", JSON.stringify({ id: "product-a", title: "Private A", productId: "a" }));
        document.body.append(detail);
        await waitForDetail(() => signal !== undefined);
        expect(detail.shadowRoot?.textContent).toContain("Private A");

        detail.setAttribute("data-source-json", "{{ dashboardData | json }}");
        await waitForDetail(() => signal?.aborted === true);
        await Promise.resolve();

        expect(detail.shadowRoot?.textContent).not.toContain("Private A");
        expect(detail.shadowRoot?.querySelector("[data-field-control='productId']")).toBeNull();
    });

    test("does not load lookups when the configured resource path is absent", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            return Response.json({ items: [] });
        }) as unknown as typeof fetch;
        const configured = singleLookupWidget() as { source: { itemPath?: string } };
        configured.source.itemPath = "item";
        const detail = detailElement(configured);
        detail.setAttribute("data-source-id", "catalog");
        detail.setAttribute("data-source-json", JSON.stringify({}));
        document.body.append(detail);
        await Promise.resolve();

        expect(requests).toBe(0);
        expect(detail.shadowRoot?.querySelector("[data-field-control]")).toBeNull();
    });

    test("ignores a queued attribute sync across disconnect and reconnect", async () => {
        let requests = 0;
        globalThis.fetch = (async () => {
            requests += 1;
            return Response.json({ items: [] });
        }) as unknown as typeof fetch;
        const detail = detailElement(singleLookupWidget());
        detail.setAttribute("data-source-id", "catalog");
        detail.setAttribute("data-row-key", "product");
        detail.setAttribute("data-source-json", JSON.stringify({ id: "product-a", productId: "a" }));
        document.body.append(detail);
        await waitForDetail(() => requests === 1);

        detail.setAttribute("data-source-json", JSON.stringify({ id: "product-b", productId: "b" }));
        detail.remove();
        document.body.append(detail);
        await waitForDetail(() => requests === 2);
        await Promise.resolve();

        expect(requests).toBe(2);
    });
});

function detailElement(widget: unknown): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute("data-config-json", JSON.stringify(widget));
    return detail;
}

function sharedLookupWidget(): unknown {
    const lookup = {
        endpoint: "brands",
        params: { categoryId: "$field.categoryId" },
        itemsPath: "items",
        valuePath: "id",
        labelPath: "name",
    };
    return widget([
        { id: "categoryId", label: "Category", path: "categoryId", type: "text" },
        { id: "brandId", label: "Brand", path: "brandId", type: "combobox", lookup },
        { id: "secondaryBrandId", label: "Secondary brand", path: "secondaryBrandId", type: "combobox", lookup },
        { id: "metadata", label: "Metadata", path: "metadata", type: "schema", schema: {
            endpoint: "brands", params: { categoryId: "$field.categoryId" }, itemsPath: "fields",
        } },
    ]);
}

function singleLookupWidget(): unknown {
    return {
        ...widget([{ id: "productId", label: "Product", path: "productId", type: "combobox", lookup: {
            endpoint: "products",
            params: { ownerId: "$resource.id" },
            itemsPath: "items",
            valuePath: "id",
            labelPath: "title",
        } }]),
        title: { path: "title", fallback: "Product" },
    };
}

function widget(fields: unknown[]) {
    return {
        widget: "w-detail",
        id: "detail",
        source: { endpoint: "resource" },
        main: [{ id: "main", title: "Main", fields }],
    };
}
