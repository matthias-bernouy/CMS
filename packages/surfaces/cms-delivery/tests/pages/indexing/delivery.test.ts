import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { mountPublicPages } from "../publicPage.fixture";
import { PRODUCT_PAGE } from "./fixtures";

const gateway = (output: unknown, status = 200): GatewayInvoker => ({
    invoke: async () => ({ kind: "success", requestId: "request-1", status, output }),
});

describe("Delivery dynamic page metadata", () => {
    test("renders gateway variables and a canonical without path caching", async () => {
        const calls: unknown[] = [];
        const mounted = mountPublicPages({
            storedPages: [PRODUCT_PAGE],
            gateway: {
                invoke: async (value) => {
                    calls.push(value);
                    return {
                        kind: "success",
                        requestId: "request-1",
                        status: 200,
                        output: { slug: "oak-chair", title: "Oak chair", description: "A solid oak chair" },
                    };
                },
            },
        });
        const response = await mounted.get(
            new Request("https://example.test/products/detail?product=requested-chair&utm_source=ignored"),
        );
        const { document } = parseHTML(await response.text());
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(document.title).toBe("Oak chair — Public pages");
        expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("A solid oak chair");
        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            "https://example.test/products/detail?product=oak-chair",
        );
        expect(calls).toMatchObject([
            {
                siteId: "site-test",
                contractId: "commerce",
                capabilityId: "product.get",
                input: { slug: "requested-chair" },
                origin: "delivery",
                actor: { kind: "anonymous" },
            },
        ]);
    });

    test("keeps metadata dynamic but emits noindex when indexing is disabled", async () => {
        const mounted = mountPublicPages({
            storedPages: [{ ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } }],
            gateway: gateway({ slug: "chair", title: "Private chair", description: "Members only" }),
        });
        const response = await mounted.get(new Request("https://example.test/products/detail?product=chair"));
        const { document } = parseHTML(await response.text());
        expect(document.title).toBe("Private chair — Public pages");
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
    });

    test("makes the dynamic base URL noindex without invoking the gateway", async () => {
        const mounted = mountPublicPages({ storedPages: [PRODUCT_PAGE] });
        const response = await mounted.get(new Request("https://example.test/products/detail"));
        const { document } = parseHTML(await response.text());
        expect(response.status).toBe(200);
        expect(document.title).toBe("Product");
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
        expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    });

    test.each([
        [400, 400],
        [404, 404],
        [422, 422],
        [502, 503],
    ])("maps a gateway %i response to public status %i", async (gatewayStatus, publicStatus) => {
        const mounted = mountPublicPages({ storedPages: [PRODUCT_PAGE], gateway: gateway(null, gatewayStatus) });
        const response = await mounted.get(new Request("https://example.test/products/detail?product=missing"));
        expect(response.status).toBe(publicStatus);
    });
});
