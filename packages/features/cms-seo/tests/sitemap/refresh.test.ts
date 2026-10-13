import { describe, expect, test } from "bun:test";
import { MemoryBlobStore } from "@bernouy/blob-store/memory";
import { CanonicalSiteHostNotConfiguredError, PrivateSiteNotIndexableError } from "@bernouy/cms-seo";
import { sitemapPage, sitemapService } from "./fixture";

describe("sitemap refresh", () => {
    test("runs immediately, coalesces refreshes, and stops without starting more work", async () => {
        const service = sitemapService({ store: new MemoryBlobStore(), pages: [sitemapPage("home", "/")] });
        const runner = service.start({ intervalMs: 60_000 });

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
        const service = sitemapService({
            store: new MemoryBlobStore(),
            pages: [sitemapPage("home", "/")],
            siteHost: () => siteHost,
        });
        const reported: unknown[] = [];

        await expect(service.materialize()).rejects.toBeInstanceOf(CanonicalSiteHostNotConfiguredError);
        const runner = service.start({
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
        const service = sitemapService({ store: new MemoryBlobStore(), siteHost: () => "not-a-url" });
        const reported: unknown[] = [];
        const runner = service.start({
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

    test("stays idle while the site is private and resumes after publication", async () => {
        let visible = false;
        const service = sitemapService({
            store: new MemoryBlobStore(),
            pages: [sitemapPage("home", "/")],
            siteVisible: () => visible,
        });
        const reported: unknown[] = [];

        await expect(service.materialize()).rejects.toBeInstanceOf(PrivateSiteNotIndexableError);
        const runner = service.start({
            intervalMs: 60_000,
            retryIntervalMs: 60_000,
            reportError: (error) => reported.push(error),
        });
        expect(await runner.ready).toBeNull();
        expect(reported).toEqual([]);

        visible = true;
        expect((await runner.refresh())?.status).toBe("published");
        await runner.stop();
    });
});
