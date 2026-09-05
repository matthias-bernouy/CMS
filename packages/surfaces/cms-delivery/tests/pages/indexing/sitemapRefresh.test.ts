import { describe, expect, test } from "bun:test";
import { InMemoryCmsFilesBlob } from "@bernouy/cms-files";
import {
    CanonicalSiteHostNotConfiguredError,
    materializeSitemapSnapshot,
    startSitemapSnapshotRefresh,
} from "@bernouy/cms-delivery";
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

    test("stays idle before the canonical site host is configured", async () => {
        let siteHost = "";
        const mounted = mountPublicPages({
            get siteHost() {
                return siteHost;
            },
            sitemapStore: new InMemoryCmsFilesBlob(),
            storedPages: [publicPage("home", "/")],
        });
        const reported: unknown[] = [];

        await expect(materializeSitemapSnapshot(mounted.delivery)).rejects.toBeInstanceOf(
            CanonicalSiteHostNotConfiguredError,
        );

        const runner = startSitemapSnapshotRefresh(mounted.delivery, {
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
            sitemapStore: new InMemoryCmsFilesBlob(),
        });
        const reported: unknown[] = [];
        const runner = startSitemapSnapshotRefresh(mounted.delivery, {
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
