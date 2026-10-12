import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { executeIndexingCapability } from "@bernouy/cms-seo";
import { PRODUCT_PAGE } from "../indexing/fixtures";
import { sitemapPage, sitemapRuntime } from "./fixture";

describe("dynamic indexing sitemap", () => {
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
        const content = contentWith([
            sitemapPage("static", "/static"),
            { ...sitemapPage("private", "/private"), indexing: { enabled: false } },
            PRODUCT_PAGE,
        ]);
        const mounted = sitemapRuntime({
            store: sitemapStore,
            content,
            execute: (contractId, capabilityId, input) =>
                executeIndexingCapability(
                    { siteId: "site-test", invoker: gateway },
                    { kind: "anonymous" },
                    contractId,
                    capabilityId,
                    input,
                ),
        });
        const fallback = await mounted.sitemap(new Request("https://example.test/sitemap.xml"));
        expect(await fallback.text()).toContain("<loc>https://example.test/static</loc>");
        expect(calls).toHaveLength(0);
        const materialized = await mounted.service.materialize();
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
        const response = await mounted.sitemap(new Request("https://example.test/sitemap.xml"));
        const chunkUrl = (await response.text()).match(/<loc>([^<]+\.xml\.gz)<\/loc>/u)?.[1];
        const chunk = await mounted.chunk(new Request(chunkUrl!));
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
        const mounted = sitemapRuntime({
            store: sitemapStore,
            content: contentWith([PRODUCT_PAGE]),
            execute: (contractId, capabilityId, input) =>
                executeIndexingCapability(
                    { siteId: "site-test", invoker: gateway },
                    { kind: "anonymous" },
                    contractId,
                    capabilityId,
                    input,
                ),
        });
        const first = await mounted.service.materialize();
        fail = true;
        await expect(mounted.service.materialize()).rejects.toThrow();
        const response = await mounted.sitemap(new Request("https://example.test/sitemap.xml"));
        expect(await response.text()).toContain(first.snapshot.id);
    });
});

function contentWith(
    pages: readonly TPage[],
): Pick<ContentReader, "getRenderingSettings" | "getPublishedPages" | "resolvePublishedRoute"> {
    const settings = defaultSystem();
    settings.site.host = "https://example.test";
    settings.site.language = "en";
    return {
        getRenderingSettings: async () => settings,
        getPublishedPages: async () => pages,
        resolvePublishedRoute: async () => null,
    };
}
