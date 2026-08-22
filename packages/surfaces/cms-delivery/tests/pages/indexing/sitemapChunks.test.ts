import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { materializeSitemapSnapshot } from "cms-delivery/core/seo/sitemap/materialize";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Delivery sitemap chunks", () => {
    test("splits more than 50,000 locations into independently served gzip files", async () => {
        const sitemapStore = new InMemoryCmsFilesBlob();
        const pages = Array.from({ length: 50_001 }, (_, index) => publicPage(`page-${index}`, `/catalog/${index}`));
        const mounted = mountPublicPages({ sitemapStore, storedPages: pages });

        const result = await materializeSitemapSnapshot(mounted.delivery);

        expect(result.snapshot.chunks.map(({ urlCount }) => urlCount)).toEqual([50_000, 1]);
        const secondUrl = `https://example.test/sitemaps/${result.snapshot.id}/2.xml.gz`;
        const response = await SitemapChunkServer(new Request(secondUrl), mounted.delivery);
        const xml = new TextDecoder().decode(gunzipSync(await response.arrayBuffer()));
        expect(response.status).toBe(200);
        expect(xml).toContain("<loc>https://example.test/catalog/50000</loc>");
        expect(xml.match(/<url>/gu)).toHaveLength(1);
    });
});
