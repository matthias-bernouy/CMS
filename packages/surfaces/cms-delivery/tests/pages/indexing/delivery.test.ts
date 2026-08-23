import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { mountPublicPages } from "../publicPage.fixture";
import { commercePublicRoles, COMMERCE_SOURCE, PRODUCT_PAGE } from "./fixtures";

describe("Delivery dynamic page metadata", () => {
    test("renders source variables, a precise canonical, and no shared path cache", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const sourceRequests: URL[] = [];
        const mounted = mountPublicPages({
            sources,
            roles: await commercePublicRoles(),
            storedPages: [PRODUCT_PAGE],
            sourceInterceptor: async (_endpoint, request) => {
                sourceRequests.push(new URL(request.url));
                return Response.json({
                    slug: "oak-chair",
                    title: "Oak chair",
                    description: "A solid oak chair",
                });
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
        expect(document.querySelector('meta[name="robots"]')).toBeNull();
        expect(JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? "")).toEqual({
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    "@id": "https://example.test/products/detail?product=oak-chair#webpage",
                    url: "https://example.test/products/detail?product=oak-chair",
                    isPartOf: { "@id": "https://example.test/#website" },
                    name: "Oak chair — Public pages",
                    description: "A solid oak chair",
                    inLanguage: "en",
                },
            ],
        });
        expect(sourceRequests).toHaveLength(1);
        expect(sourceRequests[0]?.searchParams.get("slug")).toBe("requested-chair");
        expect(sourceRequests[0]?.searchParams.has("utm_source")).toBe(false);
    });

    test("uses JSON-specific internal headers while preserving request context", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        let sourceHeaders: Headers | undefined;
        const mounted = mountPublicPages({
            sources,
            roles: await commercePublicRoles(),
            storedPages: [PRODUCT_PAGE],
            sourceInterceptor: async (_endpoint, request) => {
                sourceHeaders = new Headers(request.headers);
                if (request.headers.get("accept") !== "application/json") {
                    return new Response("Not Acceptable", { status: 406 });
                }
                return Response.json({ slug: "chair", title: "Chair", description: "A chair" });
            },
        });
        const correlationId = "123e4567-e89b-42d3-a456-426614174000";

        const response = await mounted.get(
            new Request("https://example.test/products/detail?product=chair", {
                headers: {
                    accept: "text/html,application/xhtml+xml",
                    "accept-language": "fr",
                    authorization: "Bearer visitor-token",
                    cookie: "site-session=visitor-session",
                    range: "bytes=0-100",
                    "sec-fetch-mode": "navigate",
                    "x-cms-correlation-id": correlationId,
                },
            }),
        );

        expect(response.status).toBe(200);
        expect(sourceHeaders?.get("accept")).toBe("application/json");
        expect(sourceHeaders?.get("accept-language")).toBe("fr");
        expect(sourceHeaders?.get("authorization")).toBe("Bearer visitor-token");
        expect(sourceHeaders?.get("cookie")).toBe("site-session=visitor-session");
        expect(sourceHeaders?.get("x-cms-correlation-id")).toBe(correlationId);
        expect(sourceHeaders?.get("range")).toBeNull();
        expect(sourceHeaders?.get("sec-fetch-mode")).toBeNull();
    });

    test("keeps metadata dynamic but emits noindex when the page disables indexing", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const mounted = mountPublicPages({
            sources,
            roles: await commercePublicRoles(),
            storedPages: [{ ...PRODUCT_PAGE, indexing: { ...PRODUCT_PAGE.indexing, enabled: false } }],
            sourceInterceptor: async () =>
                Response.json({ slug: "chair", title: "Private chair", description: "Members only" }),
        });

        const response = await mounted.get(new Request("https://example.test/products/detail?product=chair"));
        const { document } = parseHTML(await response.text());

        expect(document.title).toBe("Private chair — Public pages");
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
        expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    });

    test("makes the dynamic base URL noindex without emitting a misleading canonical", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const mounted = mountPublicPages({
            sources,
            roles: await commercePublicRoles(),
            storedPages: [PRODUCT_PAGE],
        });

        const response = await mounted.get(new Request("https://example.test/products/detail"));
        const { document } = parseHTML(await response.text());

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(document.title).toBe("Product");
        expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex,follow");
        expect(document.querySelector('link[rel="canonical"]')).toBeNull();
        expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    });

    test.each([
        [400, 400, "Bad Request"],
        [404, 404, "Page not found"],
        [422, 422, "Unprocessable Entity"],
        [502, 503, "Service unavailable"],
    ])("maps a source %i response to public status %i", async (sourceStatus, publicStatus, body) => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const mounted = mountPublicPages({
            sources,
            roles: await commercePublicRoles(),
            storedPages: [PRODUCT_PAGE],
            sourceInterceptor: async () => new Response(null, { status: sourceStatus }),
        });

        const response = await mounted.get(new Request("https://example.test/products/detail?product=missing"));

        expect(response.status).toBe(publicStatus);
        expect(await response.text()).toContain(body);
    });
});
