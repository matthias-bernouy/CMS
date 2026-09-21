import { describe, expect, test } from "bun:test";
import { gunzipSync } from "bun";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { SITEMAP_MANIFEST_KEY } from "cms-delivery/core/seo/sitemap/manifest";
import { materializeSitemapSnapshot } from "cms-delivery/core/seo/sitemap/materialize";
import SitemapChunkServer from "cms-delivery/endpoints/sitemap-chunk.server";
import SitemapServer from "cms-delivery/endpoints/sitemap.xml.server";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Delivery sitemap chunks", () => {
    test("splits more than 50,000 locations into independently served gzip files", async () => {
        const sitemapStore = new InMemoryCmsFilesBlob();
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
        const legacy = await SitemapChunkServer(
            new Request(`https://example.test/sitemaps/${result.snapshot.id}/2.xml.gz`),
            mounted.delivery,
        );
        expect(legacy.status).toBe(200);
        const queryRoute = await SitemapChunkServer(
            new Request(`https://example.test/sitemap.xml.gz?chunk=${result.snapshot.id}-2`),
            mounted.delivery,
        );
        expect(queryRoute.status).toBe(200);
    });

    test("keeps snapshots written before language grouping readable", async () => {
        const sitemapStore = new InMemoryCmsFilesBlob();
        const mounted = mountPublicPages({ sitemapStore, storedPages: [publicPage("home", "/")] });
        const result = await materializeSitemapSnapshot(mounted.delivery);
        const legacy = {
            ...result.snapshot,
            chunks: result.snapshot.chunks.map(({ language: _language, ...chunk }) => chunk),
        };
        await sitemapStore.put(
            SITEMAP_MANIFEST_KEY,
            new TextEncoder().encode(JSON.stringify({ version: 1, snapshots: [legacy] })),
        );

        const index = await SitemapServer(new Request("https://example.test/sitemap.xml"), mounted.delivery);
        const path = `/sitemap-${result.snapshot.id}-1.xml.gz`;
        expect(await index.text()).toContain(`<loc>https://example.test${path}</loc>`);
        const chunk = await mounted.get(new Request(`https://example.test${path}`));
        expect(chunk.status).toBe(200);
        expect(new TextDecoder().decode(gunzipSync(await chunk.arrayBuffer()))).toContain(
            "<loc>https://example.test/</loc>",
        );
    });
});
