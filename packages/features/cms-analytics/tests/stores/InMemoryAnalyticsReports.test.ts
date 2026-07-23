import { describe, expect, test } from "bun:test";
import { InMemoryAnalyticsStore } from "cms-analytics/default-implementation/InMemoryAnalyticsStore";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const FROM = new Date("2026-06-02T00:00:00.000Z");
const TO = new Date("2026-06-03T00:00:00.000Z");
const event = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "delivery_request",
    ts: new Date("2026-06-02T14:00:00.000Z"),
    status: 200,
    durationMs: 20,
    contentKind: "html",
    pageId: "page-about",
    entry: true,
    visitorHash: "a".repeat(64),
    device: "desktop",
    browser: "chrome",
    ...over,
});

describe("InMemoryAnalyticsStore reports", () => {
    test("reports request outcomes independently from content", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event());
        await store.record(event({ pageId: undefined, status: 404, durationMs: 40 }));
        await store.record(event({ pageId: undefined, status: 500, durationMs: 60 }));
        expect((await store.summary(FROM, TO)).views).toBe(1);
        expect(await store.health(FROM, TO)).toEqual({
            requests: 3,
            notFound: 1,
            clientErrors: 1,
            serverErrors: 1,
            avgMs: 40,
            maxMs: 60,
        });
    });

    test("reports direct stable-id flows and entry pages without raw paths", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event({ previousPageId: "page-home", entry: false }));
        await store.record(event({ pageId: "page-contact" }));
        expect(await store.flows(FROM, TO, 10)).toEqual([{ from: "page-home", to: "page-about", count: 1 }]);
        expect(await store.entries(FROM, TO, 10)).toEqual([{ key: "page-contact", count: 1 }]);
    });

    test("groups content views into fixed hour and day buckets", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event({ ts: new Date("2026-06-02T14:10:00Z") }));
        await store.record(event({ ts: new Date("2026-06-02T14:50:00Z") }));
        await store.record(event({ ts: new Date("2026-06-02T16:00:00Z") }));
        const hours = await store.timeseries({
            from: new Date("2026-06-02T14:00:00Z"),
            to: new Date("2026-06-02T17:00:00Z"),
            interval: "hour",
        });
        expect(hours.map((bucket) => bucket.count)).toEqual([2, 0, 1]);
        expect((await store.timeseries({ from: FROM, to: TO, interval: "day" }))[0]?.count).toBe(3);
    });

    test("reports bounded external origins and the literal no-referrer category", async () => {
        const store = new InMemoryAnalyticsStore({ policy: { referrerCapacity: 2 } });
        await store.record(event());
        await store.record(event({ referrerDomain: "news.example", visitorHash: "b".repeat(64) }));
        await store.record(event({ referrerDomain: "news.example", visitorHash: "c".repeat(64) }));
        expect(await store.topReferrers(FROM, TO, 10)).toEqual([
            { key: "news.example", count: 2 },
            { key: "__none__", count: 1 },
        ]);
    });

    test("treats a policy-rejected external origin as no external referrer", async () => {
        const store = new InMemoryAnalyticsStore({
            policy: { ignoredReferrerDomains: ["spam.example"] },
        });
        await store.record(event({ referrerDomain: "sub.spam.example" }));
        expect(await store.topReferrers(FROM, TO, 10)).toEqual([{ key: "__none__", count: 1 }]);
    });
});
