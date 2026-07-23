import { describe, expect, test } from "bun:test";
import { InMemoryAnalyticsStore } from "cms-analytics/default-implementation/InMemoryAnalyticsStore";
import { sha256HexAsync } from "cms-analytics/core/identity/sha256Hex";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const FROM = new Date("2026-06-01T00:00:00.000Z");
const TO = new Date("2026-06-03T00:00:00.000Z");

async function event(over: Partial<AnalyticsEvent> = {}): Promise<AnalyticsEvent> {
    return {
        type: "delivery_request",
        ts: new Date("2026-06-02T14:00:00.000Z"),
        status: 200,
        durationMs: 10,
        contentKind: "html",
        pageId: "page-home",
        entry: true,
        visitorHash: await sha256HexAsync(crypto.randomUUID()),
        device: "desktop",
        browser: "chrome",
        ...over,
    };
}

describe("InMemoryAnalyticsStore", () => {
    test("separates content views, request health, entries, and stable page rankings", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(await event({ pageId: "page-a" }));
        await store.record(await event({ pageId: "page-a", durationMs: 30 }));
        await store.record(await event({ pageId: undefined, status: 404, durationMs: 60 }));
        expect(await store.topPages(FROM, TO, 10)).toEqual([{ key: "page-a", count: 2 }]);
        expect(await store.entries(FROM, TO, 10)).toEqual([{ key: "page-a", count: 2 }]);
        expect((await store.summary(FROM, TO)).views).toBe(2);
        expect(await store.health(FROM, TO)).toMatchObject({ requests: 3, notFound: 1, avgMs: 33, maxMs: 60 });
    });

    test("estimates daily visitors only after the UTC day closes", async () => {
        const store = new InMemoryAnalyticsStore({ hllStripes: 4 });
        const repeat = await sha256HexAsync("repeat");
        for (const hash of [repeat, repeat, await sha256HexAsync("second"), await sha256HexAsync("third")]) {
            await store.record(await event({ visitorHash: hash }));
        }
        expect((await store.summary(FROM, TO)).estimatedVisitors).toBe(0);
        await store.finalizeVisitors(new Date("2026-06-03T00:00:00.000Z"));
        const summary = await store.summary(FROM, TO);
        expect(summary.estimatedVisitors).toBe(3);
        expect(summary.uniqueVisitors).toBe(3);
        await store.finalizeVisitors(new Date("2026-06-04T00:00:00.000Z"));
        expect((await store.summary(FROM, TO)).estimatedVisitors).toBe(3);
    });

    test("merges stripes with register max and never creates per-dimension visitors", async () => {
        const store = new InMemoryAnalyticsStore({ hllStripes: 16 });
        for (let index = 0; index < 1_000; index++) {
            await store.record(
                await event({
                    visitorHash: await sha256HexAsync(`visitor-${index}`),
                    device: index % 2 ? "desktop" : "mobile",
                }),
            );
        }
        await store.finalizeVisitors(new Date("2026-06-03T00:00:00.000Z"));
        expect(Math.abs((await store.summary(FROM, TO)).estimatedVisitors - 1_000) / 1_000).toBeLessThan(0.06);
        expect(await store.breakdown("device", FROM, TO)).toEqual([
            { key: "mobile", count: 500 },
            { key: "desktop", count: 500 },
        ]);
    });

    test("excluded automation affects only the bounded exclusion report", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(await event({ exclusionReason: "automation", visitorHash: undefined }));
        expect((await store.summary(FROM, TO)).views).toBe(0);
        expect((await store.health(FROM, TO)).requests).toBe(0);
        expect(await store.breakdown("exclusion", FROM, TO)).toEqual([{ key: "automation", count: 1 }]);
    });
});
