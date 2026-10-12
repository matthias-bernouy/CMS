import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CanonicalSiteHostNotConfiguredError } from "@bernouy/cms-seo";
import { materializeSitemapSnapshot, startSitemapSnapshotRefresh } from "cms-kernel/site/seo/sitemap";
import { mountPublicPages, publicPage } from "../publicPage.fixture";

describe("Kernel sitemap refresh", () => {
    test("runs immediately, coalesces refreshes, and stops without starting more work", async () => {
        const mounted = mountPublicPages({
            sitemapStore: new MemoryBlobStore(),
            storedPages: [publicPage("home", "/")],
        });
        const runner = startSitemapSnapshotRefresh(mounted.kernel, {
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

    test("stays idle before the canonical site host is configured", async () => {
        let siteHost = "";
        const mounted = mountPublicPages({
            get siteHost() {
                return siteHost;
            },
            sitemapStore: new MemoryBlobStore(),
            storedPages: [publicPage("home", "/")],
        });
        const reported: unknown[] = [];

        await expect(materializeSitemapSnapshot(mounted.kernel)).rejects.toBeInstanceOf(
            CanonicalSiteHostNotConfiguredError,
        );

        const runner = startSitemapSnapshotRefresh(mounted.kernel, {
            intervalMs: 60_000,
            retryIntervalMs: 60_000,
            reportError: (error) => reported.push(error),
        });
        expect(await runner.ready).toBeNull();
        expect(reported).toEqual([]);

        siteHost = "https://configured.test";
        expect((await runner.refresh())?.status).toBe("published");
        expect(reported).toEqual([]);
        await runner.stop();
    });

    test("still reports an invalid canonical site host", async () => {
        const mounted = mountPublicPages({
            siteHost: "not-a-url",
            sitemapStore: new MemoryBlobStore(),
        });
        const reported: unknown[] = [];
        const runner = startSitemapSnapshotRefresh(mounted.kernel, {
            intervalMs: 60_000,
            retryIntervalMs: 60_000,
            reportError: (error) => reported.push(error),
        });

        expect(await runner.ready).toBeNull();
        expect(reported).toHaveLength(1);
        expect(reported[0]).toBeInstanceOf(TypeError);
        expect((reported[0] as Error).message).toBe("canonical site host is invalid");
        await runner.stop();
    });
});
