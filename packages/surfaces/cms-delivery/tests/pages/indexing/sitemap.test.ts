import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { materializeSitemapSnapshot } from "cms-delivery/core/seo/sitemap/materialize";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import { mountPublicPages, publicPage } from "../publicPage.fixture";
import { commercePublicRoles, COMMERCE_SOURCE, PRODUCT_PAGE } from "./fixtures";

describe("Delivery dynamic indexing sitemap", () => {
    test("publishes discovery as immutable chunks without querying sources on public requests", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const sitemapStore = new InMemoryCmsFilesBlob();
        const sourceRequests: Request[] = [];
        const provider: PublicPageProvider = {
            resolvePage: async () => null,
            listSitemapPaths: async () => ["/private", PRODUCT_PAGE.path, "/provider"],
        };
        const mounted = mountPublicPages({
            providers: [provider],
            roles: await commercePublicRoles(),
            sitemapStore,
            sources,
            storedPages: [
                publicPage("static", "/static"),
                { ...publicPage("private", "/private"), indexing: { enabled: false } },
                PRODUCT_PAGE,
            ],
            sourceInterceptor: async (_endpoint, request) => {
                sourceRequests.push(request);
                const offset = Number(new URL(request.url).searchParams.get("offset"));
                return offset === 0
                    ? Response.json({
                          items: [
                              { slug: "oak & chair", updatedAt: "2026-08-22T10:00:00Z" },
                              { slug: "table", updatedAt: "2026-02-30" },
                          ],
                          total: 3,
                      })
                    : Response.json({ items: [{ slug: "lamp", updatedAt: "2026-08-23" }], total: 3 });
            },
        });

        const fallback = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
        expect(await fallback.text()).toContain("<loc>https://example.test/static</loc>");
        expect(sourceRequests).toHaveLength(0);

        const materialized = await materializeSitemapSnapshot(mounted.delivery);
        expect(materialized.status).toBe("published");
        expect(materialized.snapshot.chunks).toHaveLength(1);
        expect(sourceRequests).toHaveLength(2);
        for (const sourceRequest of sourceRequests) {
            expect(sourceRequest.headers.get("accept")).toBe("application/json");
            expect(sourceRequest.headers.get("accept-language")).toBeNull();
            expect(sourceRequest.headers.get("authorization")).toBeNull();
            expect(sourceRequest.headers.get("cookie")).toBeNull();
            expect(sourceRequest.headers.get("range")).toBeNull();
        }

        const response = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
        const indexXml = await response.text();
        const chunkUrl = indexXml.match(/<loc>([^<]+\.xml\.gz)<\/loc>/u)?.[1];
        expect(response.headers.get("cache-control")).toBe("public, no-cache");
        expect(chunkUrl).toBe(`https://example.test/sitemaps/${materialized.snapshot.id}/1.xml.gz`);
        expect(sourceRequests).toHaveLength(2);

        const chunk = await SitemapChunkServer(new Request(chunkUrl!), mounted.delivery);
        const xml = new TextDecoder().decode(gunzipSync(await chunk.arrayBuffer()));
        expect(chunk.headers.get("cache-control")).toContain("immutable");
        expect(xml).toContain("<loc>https://example.test/static</loc>");
        expect(xml).toContain("<loc>https://example.test/provider</loc>");
        expect(xml).not.toContain("<loc>https://example.test/private</loc>");
        expect(xml).not.toContain("<loc>https://example.test/products/detail</loc>");
        expect(xml).toContain(
            "<loc>https://example.test/products/detail?product=oak+%26+chair</loc><lastmod>2026-08-22T10:00:00.000Z</lastmod>",
        );
        expect(xml).toContain("<loc>https://example.test/products/detail?product=table</loc></url>");
        expect(xml).toContain(
            "<loc>https://example.test/products/detail?product=lamp</loc><lastmod>2026-08-23</lastmod>",
        );
    });

    test("keeps the last good snapshot when a later discovery fails", async () => {
        const sources = new InMemorySourceRepository();
        await sources.createSource(COMMERCE_SOURCE);
        const sitemapStore = new InMemoryCmsFilesBlob();
        let fail = false;
        let cancelled = false;
        const mounted = mountPublicPages({
            roles: await commercePublicRoles(),
            sitemapStore,
            sources,
            storedPages: [PRODUCT_PAGE],
            sourceInterceptor: async () => {
                if (!fail) {
                    return Response.json({ items: [{ slug: "kept" }], total: 1 });
                }
                return new Response(
                    new ReadableStream({
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { status: 502 },
                );
            },
        });
        const first = await materializeSitemapSnapshot(mounted.delivery);
        fail = true;

        await expect(materializeSitemapSnapshot(mounted.delivery)).rejects.toThrow();
        expect(cancelled).toBe(true);

        const response = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(first.snapshot.id);
    });
});
