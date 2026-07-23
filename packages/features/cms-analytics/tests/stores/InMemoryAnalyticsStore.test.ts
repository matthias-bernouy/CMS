import { describe, test, expect } from "bun:test";
import { InMemoryAnalyticsStore } from "cms-analytics/default-implementation/InMemoryAnalyticsStore";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const ev = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "pageview",
    ts: new Date("2026-06-02T14:00:00.000Z"),
    path: "/",
    status: 200,
    durationMs: 10,
    visitorId: "v1",
    device: "desktop",
    browser: "chrome",
    ...over,
});

const FROM = new Date("2026-06-01T00:00:00.000Z");
const TO = new Date("2026-06-03T00:00:00.000Z");

describe("InMemoryAnalyticsStore", () => {
    test("summary: views, avgMs, errorRate", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ durationMs: 10 }));
        await s.record(ev({ durationMs: 30, status: 404, visitorId: "v2" }));
        const sum = await s.summary(FROM, TO);
        expect(sum.views).toBe(1);
        expect(sum.avgMs).toBe(10);
        expect(sum.errorRate).toBe(0.5);
        expect(sum.visitorDays).toBe(1);
        expect(sum.averageDailyVisitors).toBe(0.5);
    });

    test("unique visitors dedup within a day, recount on a new day", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ visitorId: "v1" }));
        await s.record(ev({ visitorId: "v1" })); // same day → not recounted
        await s.record(ev({ visitorId: "v2" }));
        await s.record(ev({ visitorId: "v1", ts: new Date("2026-06-02T19:00:00.000Z") })); // still same day
        await s.record(ev({ visitorId: "v1", ts: new Date("2026-06-01T09:00:00.000Z") })); // new day → +1
        const sum = await s.summary(FROM, TO);
        expect(sum.uniqueVisitors).toBe(3);
        expect(sum.views).toBe(5);
    });

    test("bots are excluded from content and request health", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ device: "bot", visitorId: "bot1" }));
        const sum = await s.summary(FROM, TO);
        expect(sum.views).toBe(0);
        expect(sum.uniqueVisitors).toBe(0);
        expect((await s.health(FROM, TO)).requests).toBe(0);
    });

    test("topPaths sorts by count and respects limit", async () => {
        const s = new InMemoryAnalyticsStore();
        for (let i = 0; i < 3; i++) {
            await s.record(ev({ path: "/a", visitorId: `va${i}` }));
        }
        await s.record(ev({ path: "/b", visitorId: "vb" }));
        expect(await s.topPaths(FROM, TO, 1)).toEqual([{ key: "/a", count: 3 }]);
    });

    test("topPages uses pageId and excludes unmatched failures", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ pageId: "page-a", path: "/old-a" }));
        await s.record(ev({ pageId: "page-a", path: "/new-a", visitorId: "v2" }));
        await s.record(ev({ status: 404, path: "/.env", visitorId: "scanner" }));
        expect(await s.topPages(FROM, TO, 10)).toEqual([{ key: "page-a", count: 2 }]);
    });

    test("breakdown by device, descending", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ device: "desktop", visitorId: "v1" }));
        await s.record(ev({ device: "mobile", visitorId: "v2" }));
        await s.record(ev({ device: "mobile", visitorId: "v3" }));
        expect(await s.breakdown("device", FROM, TO)).toEqual([
            { key: "mobile", count: 2 },
            { key: "desktop", count: 1 },
        ]);
    });

    test("timeseries groups by hour", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ ts: new Date("2026-06-02T14:10:00.000Z"), visitorId: "v1" }));
        await s.record(ev({ ts: new Date("2026-06-02T14:50:00.000Z"), visitorId: "v2" }));
        await s.record(ev({ ts: new Date("2026-06-02T16:00:00.000Z"), visitorId: "v3" }));
        const ts = await s.timeseries({
            from: new Date("2026-06-02T14:00:00.000Z"),
            to: new Date("2026-06-02T17:00:00.000Z"),
            interval: "hour",
        });
        expect(ts).toHaveLength(3);
        expect(ts[0]?.bucket.toISOString()).toBe("2026-06-02T14:00:00.000Z");
        expect(ts[0]?.count).toBe(2);
        expect(ts[1]?.count).toBe(0);
        expect(ts[2]?.count).toBe(1);
    });

    test("timeseries groups by day", async () => {
        const s = new InMemoryAnalyticsStore();
        await s.record(ev({ ts: new Date("2026-06-01T09:00:00.000Z"), visitorId: "v1" }));
        await s.record(ev({ ts: new Date("2026-06-01T20:00:00.000Z"), visitorId: "v2" }));
        await s.record(ev({ ts: new Date("2026-06-02T09:00:00.000Z"), visitorId: "v3" }));
        const ts = await s.timeseries({ from: FROM, to: TO, interval: "day" });
        expect(ts.map((b) => b.count)).toEqual([2, 1]);
    });
});
