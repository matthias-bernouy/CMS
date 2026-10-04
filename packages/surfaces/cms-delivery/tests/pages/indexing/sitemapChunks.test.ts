import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { materializeSitemapSnapshot } from "cms-delivery/core/seo/sitemap/materialize";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Delivery sitemap chunks", () => {
    test("splits more than 50,000 locations into independently served gzip files", async () => {
        const sitemapStore = new MemoryBlobStore();
        const pages = Array.from({ length: 50_001 }, (_, index) => {
            const path = `/catalog/${index}`;
            return { ...publicPage(`page-${index}`, path), paths: { en: path } };
        });
        const mounted = mountPublicPages({ sitemapStore, storedPages: pages });

        const result = await materializeSitemapSnapshot(mounted.delivery);

        expect(result.snapshot.chunks.map(({ urlCount }) => urlCount)).toEqual([50_000, 1]);
        expect(result.snapshot.chunks.map(({ language }) => language)).toEqual(["en", "en"]);
        const secondUrl = `https://example.test/sitemap-lang-en.${result.snapshot.id}.2.xml.gz`;
        const response = await SitemapChunkServer(new Request(secondUrl), mounted.delivery);
        const xml = new TextDecoder().decode(gunzipSync(await response.arrayBuffer()));
        expect(response.status).toBe(200);
        expect(xml).toContain("<loc>https://example.test/catalog/50000</loc>");
        expect(xml.match(/<url>/gu)).toHaveLength(1);
        const mountedResponse = await mounted.get(new Request(secondUrl));
        expect(mountedResponse.status).toBe(200);
        const head = await mounted.head(new Request(secondUrl, { method: "HEAD" }));
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
    });
});
