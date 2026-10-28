import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { sitemapChunkPath } from "@bernouy/cms-content/seo";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Content sitemap chunk mounting", () => {
    test("serves generated chunks through GET and bodyless HEAD", async () => {
        const store = new MemoryBlobStore();
        const mounted = mountPublicPages({ sitemapStore: store, storedPages: [publicPage("home", "/")] });
        const result = await mounted.sitemapService!.materialize();
        const chunk = result.snapshot.chunks[0]!;
        const url = `https://example.test${sitemapChunkPath(result.snapshot.id, chunk.index, chunk.language)}`;

        expect((await mounted.get(new Request(url))).status).toBe(200);
        const head = await mounted.head(new Request(url, { method: "HEAD" }));
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
    });
});
