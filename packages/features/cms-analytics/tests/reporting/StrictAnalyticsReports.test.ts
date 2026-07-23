import { describe, expect, test } from "bun:test";
import { StrictAnalyticsReports } from "cms-analytics/core/reporting/StrictAnalyticsReports";
import { sha256HexAsync } from "cms-analytics/core/sha256Hex";
import { InMemoryAnalyticsStore } from "cms-analytics/default-implementation/InMemoryAnalyticsStore";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const NOW = new Date("2026-06-04T12:34:56.000Z");

async function event(index: number, over: Partial<AnalyticsEvent> = {}): Promise<AnalyticsEvent> {
    return {
        type: "delivery_request",
        ts: new Date("2026-06-04T11:30:00.000Z"),
        status: 200,
        durationMs: 123,
        contentKind: "html",
        pageId: "page-a",
        entry: true,
        visitorHash: await sha256HexAsync(`visitor-${index}`),
        device: "desktop",
        browser: "chrome",
        ...over,
    };
}

describe("StrictAnalyticsReports", () => {
    test("anchors windows to closed buckets and suppresses values below k=10", async () => {
        const store = new InMemoryAnalyticsStore();
        for (let index = 0; index < 9; index++) {
            await store.record(await event(index));
        }
        const report = await new StrictAnalyticsReports(store).timeseries("24h", NOW);
        expect(report.data.at(-1)).toEqual({
            bucket: new Date("2026-06-04T11:00:00.000Z"),
            count: 0,
        });
        expect(report.meta).toMatchObject({
            threshold: 10,
            rounding: 10,
            suppressedValueCount: 1,
            lastClosedBucket: new Date("2026-06-04T12:00:00.000Z"),
        });
    });

    test("rounds publishable counts and groups suitable rare keys into Other", async () => {
        const store = new InMemoryAnalyticsStore();
        for (let index = 0; index < 10; index++) {
            await store.record(await event(index, { pageId: "page-a" }));
        }
        for (let index = 10; index < 15; index++) {
            await store.record(await event(index, { pageId: "page-b" }));
        }
        for (let index = 15; index < 20; index++) {
            await store.record(await event(index, { pageId: "page-c" }));
        }
        const report = await new StrictAnalyticsReports(store).topPages("24h", 10, NOW);
        expect(report.data).toEqual([
            { key: "page-a", count: 10 },
            { key: "__other__", count: 10 },
        ]);
        expect(report.meta.suppressedValueCount).toBe(2);
    });

    test("never publishes rare navigation edges or exact latency", async () => {
        const store = new InMemoryAnalyticsStore();
        for (let index = 0; index < 9; index++) {
            await store.record(
                await event(index, {
                    previousPageId: "page-home",
                    entry: false,
                    durationMs: 137,
                }),
            );
        }
        const reports = new StrictAnalyticsReports(store);
        expect((await reports.flows("24h", 10, NOW)).data).toEqual([]);
        expect((await reports.health("24h", NOW)).data).toMatchObject({
            requests: 0,
            avgMs: null,
            maxMs: null,
        });
    });

    test("publishes only finalized daily HLL estimates with policy versions", async () => {
        const store = new InMemoryAnalyticsStore();
        for (let index = 0; index < 10; index++) {
            await store.record(await event(index, { ts: new Date("2026-06-03T12:00:00Z") }));
        }
        const report = await new StrictAnalyticsReports(store).summary("7d", NOW);
        expect(report.data.estimatedVisitors).toBe(10);
        expect(report.data.uniqueVisitors).toBe(10);
        expect(report.meta.versions).toMatchObject({
            filter: "strict-filter-v1",
            publication: "strict-publication-v1",
        });
        expect(JSON.stringify(report)).not.toContain("registers");
    });
});
