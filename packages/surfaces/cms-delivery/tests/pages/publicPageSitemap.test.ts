import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import RobotsServer from "cms-delivery/endpoints/robots.txt.server";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

describe("Delivery public page provider sitemap", () => {
    test("uses the configured site host consistently across every SEO URL", async () => {
        const mounted = mountPublicPages({
            siteHost: "https://canonical.test/store",
            storedPages: [publicPage("product", "/product")],
        });

        const pageResponse = await mounted.get(new Request("https://runtime.internal/product"));
        const { document } = parseHTML(await pageResponse.text());
        const sitemap = await SitemapServer(new Request("https://runtime.internal/sitemap.xml"), mounted.delivery);
        const robots = await RobotsServer(new Request("https://runtime.internal/robots.txt"), mounted.delivery);

        expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
            "https://canonical.test/store/product",
        );
        expect(await sitemap.text()).toContain("<loc>https://canonical.test/store/product</loc>");
        expect(await robots.text()).toContain("Sitemap: https://canonical.test/store/sitemap.xml");
    });

    test("merges validated provider paths with stored pages and deduplicates canonical URLs", async () => {
        const provider: PublicPageProvider = {
            resolvePage: async () => null,
            listSitemapPaths: async () => [
                "/integrations",
                "/integrations/example",
                "/shared",
                "/.cms/internal",
                "/robots.txt",
                "/favicon.ico",
            ],
        };
        const mounted = mountPublicPages({
            providers: [provider],
            storedPages: [
                publicPage("stored", "/stored"),
                publicPage("shared", "/shared"),
                publicPage("asset", "/.cms/asset"),
            ],
        });

        const response = await SitemapServer(new Request("https://unexpected.test/sitemap.xml"), mounted.delivery);
        const xml = await response.text();

        expect(response.status).toBe(200);
        expect(xml).toContain("<loc>https://example.test/stored</loc>");
        expect(xml).toContain("<loc>https://example.test/integrations</loc>");
        expect(xml).toContain("<loc>https://example.test/integrations/example</loc>");
        expect(xml.match(/<loc>https:\/\/example\.test\/shared<\/loc>/g)).toHaveLength(1);
        expect(xml).not.toContain("/.cms/");
        expect(xml).not.toContain("/robots.txt</loc>");
        expect(xml).not.toContain("/favicon.ico</loc>");
        expect(xml).not.toContain("unexpected.test");
    });

    test("is unavailable without a configured canonical host", async () => {
        const mounted = mountPublicPages({ siteHost: "", storedPages: [publicPage("stored", "/stored")] });

        const response = await SitemapServer(new Request("https://unexpected.test/sitemap.xml"), mounted.delivery);

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toBe("Service Unavailable");
    });

    test("fails explicitly for invalid or excessive provider output", async () => {
        const invalid = mountPublicPages({
            providers: [
                {
                    resolvePage: async () => null,
                    listSitemapPaths: async () => ["/catalog/../private"],
                },
            ],
        });
        const invalidResponse = await SitemapServer(new Request("https://example.test/sitemap.xml"), invalid.delivery);
        expect(invalidResponse.status).toBe(500);

        const excessive = mountPublicPages({
            providers: [
                {
                    resolvePage: async () => null,
                    listSitemapPaths: async () =>
                        Array.from({ length: 10_001 }, (_, index) => `/integrations/${index}`),
                },
            ],
        });
        const excessiveResponse = await SitemapServer(
            new Request("https://example.test/sitemap.xml"),
            excessive.delivery,
        );
        expect(excessiveResponse.status).toBe(500);
    });

    test("does not expose provider failure details", async () => {
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async () => null,
                    listSitemapPaths: async () => Promise.reject(new Error("secret upstream topology")),
                },
            ],
        });

        const response = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);

        expect(response.status).toBe(500);
        expect(await response.text()).toBe("Internal Server Error");
    });
});
