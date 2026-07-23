import { describe, expect, test } from "bun:test";
import { InMemoryAnalyticsStore } from "cms-analytics/default-implementation/InMemoryAnalyticsStore";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const FROM = new Date("2026-06-02T00:00:00.000Z");
const TO = new Date("2026-06-03T00:00:00.000Z");

const event = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "pageview",
    ts: new Date("2026-06-02T14:00:00.000Z"),
    path: "/about",
    status: 200,
    durationMs: 20,
    visitorId: crypto.randomUUID(),
    device: "desktop",
    browser: "chrome",
    ...over,
});

describe("InMemoryAnalyticsStore reports", () => {
    test("separates content views from request health", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event());
        await store.record(event({ status: 404, path: "/wp-login.php", durationMs: 40 }));
        await store.record(event({ status: 500, durationMs: 60 }));

        expect((await store.summary(FROM, TO)).views).toBe(1);
        expect(await store.health(FROM, TO)).toEqual({
            requests: 3,
            notFound: 1,
            clientErrors: 1,
            serverErrors: 1,
            avgMs: 40,
            maxMs: 60,
        });
        expect(await store.breakdown("status", FROM, TO)).toEqual([
            { key: "200", count: 1 },
            { key: "404", count: 1 },
            { key: "500", count: 1 },
        ]);
    });

    test("reports acquisition channels and external referrers", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event({ referrerHost: "google.com" }));
        await store.record(event({ referrerHost: "news.example", visitorId: "v2" }));
        await store.record(event({ fromPath: "/", visitorId: "v3" }));
        await store.record(event({ visitorId: "v4" }));

        expect(await store.breakdown("acquisition", FROM, TO)).toEqual([
            { key: "search", count: 1 },
            { key: "referral", count: 1 },
            { key: "internal", count: 1 },
            { key: "direct", count: 1 },
        ]);
        expect(await store.topReferrers(FROM, TO, 10)).toEqual([
            { key: "google.com", count: 1 },
            { key: "news.example", count: 1 },
        ]);
    });

    test("ignores configured referrer hosts without dropping content views", async () => {
        const store = new InMemoryAnalyticsStore({
            policy: { ignoredReferrerHosts: ["spam.example"] },
        });
        await store.record(event({ referrerHost: "sub.spam.example" }));

        expect((await store.summary(FROM, TO)).views).toBe(1);
        expect(await store.topReferrers(FROM, TO, 10)).toEqual([]);
        expect(await store.breakdown("acquisition", FROM, TO)).toEqual([]);
    });

    test("returns structured internal flows", async () => {
        const store = new InMemoryAnalyticsStore();
        await store.record(event({ fromPath: "/home", path: "/about" }));
        expect(await store.flows(FROM, TO, 10)).toEqual([{ from: "/home", to: "/about", count: 1 }]);
    });

    test("can require page ids at the store boundary", async () => {
        const store = new InMemoryAnalyticsStore({ policy: { requirePageId: true } });
        await store.record(event());
        await store.record(event({ pageId: "about", visitorId: "v2" }));
        expect((await store.summary(FROM, TO)).views).toBe(1);
    });
});
