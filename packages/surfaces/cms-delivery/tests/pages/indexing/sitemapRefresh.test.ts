import { describe, expect, test } from "bun:test";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import { startSitemapSnapshotRefresh } from "@bernouy/cms-delivery";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Delivery sitemap refresh", () => {
    test("runs immediately, coalesces refreshes, and stops without starting more work", async () => {
        const mounted = mountPublicPages({
            sitemapStore: new InMemoryCmsFilesBlob(),
            storedPages: [publicPage("home", "/")],
        });
        const runner = startSitemapSnapshotRefresh(mounted.delivery, {
            intervalMs: 60_000,
        });

        expect((await runner.ready)?.status).toBe("published");
        const first = runner.refresh();
        const concurrent = runner.refresh();
        expect(concurrent).toBe(first);
        expect((await first)?.status).toBe("unchanged");

        await runner.stop();
        expect(await runner.refresh()).toBeNull();
    });
});
