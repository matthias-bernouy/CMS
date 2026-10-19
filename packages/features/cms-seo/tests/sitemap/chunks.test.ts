import { gunzipSync } from "bun";
import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { createSitemapChunkHandler } from "@bernouy/cms-seo/http";
import { NOOP_LOGGER } from "@bernouy/logging";
import { sitemapPage, sitemapService } from "./fixture";

describe("sitemap chunks", () => {
    test("splits more than 50,000 locations into independently served gzip files", async () => {
        const store = new MemoryBlobStore();
        const pages = Array.from({ length: 50_001 }, (_, index) => {
            const path = `/catalog/${index}`;
            return { ...sitemapPage(`page-${index}`, path), paths: { en: path } };
        });
        const service = sitemapService({ store, pages });
        const result = await service.materialize();

        expect(result.snapshot.chunks.map(({ urlCount }) => urlCount)).toEqual([50_000, 1]);
        expect(result.snapshot.chunks.map(({ language }) => language)).toEqual(["en", "en"]);
        const secondUrl = `https://example.test/sitemap-lang-en.${result.snapshot.id}.2.xml.gz`;
        const handler = createSitemapChunkHandler({ store, basePath: "", logger: NOOP_LOGGER });
        const response = await handler(new Request(secondUrl));
        const xml = new TextDecoder().decode(gunzipSync(await response.arrayBuffer()));

        expect(response.status).toBe(200);
        expect(xml).toContain("<loc>https://example.test/catalog/50000</loc>");
        expect(xml.match(/<url>/gu)).toHaveLength(1);
    });
});
