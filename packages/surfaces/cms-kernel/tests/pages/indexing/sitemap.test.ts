import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { materializeSitemapSnapshot } from "cms-kernel/seo/sitemap";
import SitemapChunkServer from "cms-kernel/endpoints/sitemap-chunk.server";
import SitemapServer from "cms-kernel/endpoints/sitemap.xml.server";
import { mountPublicPages, publicPage } from "../publicPage.fixture";
import { PRODUCT_PAGE } from "./fixtures";

describe("Kernel dynamic indexing sitemap", () => {
    test("publishes discovery from an anonymous gateway capability as immutable chunks", async () => {
        const sitemapStore = new MemoryBlobStore();
        const calls: unknown[] = [];
        const gateway: GatewayInvoker = {
            invoke: async (value) => {
                calls.push(value);
                const offset = Number((value.input as Record<string, number>).offset);
                return {
                    kind: "success",
                    requestId: `request-${calls.length}`,
                    status: 200,
                    output:
                        offset === 0
                            ? {
                                  items: [
                                      { slug: "oak & chair", updatedAt: "2026-08-22T10:00:00Z" },
                                      { slug: "table", updatedAt: "2026-02-30" },
                                  ],
                                  total: 3,
                              }
                            : { items: [{ slug: "lamp", updatedAt: "2026-08-23" }], total: 3 },
                };
            },
        };
        const mounted = mountPublicPages({
            sitemapStore,
            gateway,
            storedPages: [
                publicPage("static", "/static"),
                { ...publicPage("private", "/private"), indexing: { enabled: false } },
                PRODUCT_PAGE,
            ],
        });
        const fallback = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.kernel);
        expect(await fallback.text()).toContain("<loc>https://example.test/static</loc>");
        expect(calls).toHaveLength(0);
        const materialized = await materializeSitemapSnapshot(mounted.kernel);
        expect(materialized.status).toBe("published");
        expect(calls).toMatchObject([
            {
                contractId: "commerce",
                capabilityId: "product.list",
                input: { limit: 2, offset: 0 },
                actor: { kind: "anonymous" },
            },
            {
                contractId: "commerce",
                capabilityId: "product.list",
                input: { limit: 2, offset: 2 },
                actor: { kind: "anonymous" },
            },
        ]);
        const response = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.kernel);
        const chunkUrl = (await response.text()).match(/<loc>([^<]+\.xml\.gz)<\/loc>/u)?.[1];
        const chunk = await SitemapChunkServer(new Request(chunkUrl!), mounted.kernel);
        const xml = new TextDecoder().decode(gunzipSync(await chunk.arrayBuffer()));
        expect(xml).toContain("<loc>https://example.test/static</loc>");
        expect(xml).not.toContain("<loc>https://example.test/private</loc>");
        expect(xml).toContain("<loc>https://example.test/products/detail?product=oak+%26+chair</loc>");
        expect(xml).toContain("<loc>https://example.test/products/detail?product=lamp</loc>");
    });

    test("keeps the last good snapshot when gateway discovery fails", async () => {
        const sitemapStore = new MemoryBlobStore();
        let fail = false;
        const gateway: GatewayInvoker = {
            invoke: async () => ({
                kind: "success",
                requestId: "request-1",
                status: fail ? 502 : 200,
                output: { items: [{ slug: "kept" }], total: 1 },
            }),
        };
        const mounted = mountPublicPages({ sitemapStore, gateway, storedPages: [PRODUCT_PAGE] });
        const first = await materializeSitemapSnapshot(mounted.kernel);
        fail = true;
        await expect(materializeSitemapSnapshot(mounted.kernel)).rejects.toThrow();
        const response = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.kernel);
        expect(await response.text()).toContain(first.snapshot.id);
    });
});
