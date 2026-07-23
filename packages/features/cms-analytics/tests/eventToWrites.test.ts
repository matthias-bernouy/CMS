import { describe, test, expect } from "bun:test";
import { eventToWrites, isCountedEvent } from "cms-analytics/core/eventToWrites";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const ev = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "pageview",
    ts: new Date("2026-06-02T14:37:45.123Z"),
    path: "/about",
    status: 200,
    durationMs: 12,
    visitorId: "vid",
    device: "desktop",
    browser: "chrome",
    ...over,
});

describe("eventToWrites", () => {
    test("a successful request yields request health and content rollups", () => {
        const w = eventToWrites(ev());
        expect(w.filter((x) => x.metric === "request").map((x) => `${x.dim}:${x.key}`)).toEqual([
            "all:_",
            "status:200",
            "outcome:success",
        ]);
        expect(w.filter((x) => x.metric === "pv").map((x) => `${x.dim}:${x.key}`)).toEqual([
            "all:_",
            "page:/about",
            "status:200",
            "device:desktop",
            "browser:chrome",
            "acquisition:direct",
        ]);
    });

    test("each rollup has count 1, an hourly bucket and a deterministic id", () => {
        for (const x of eventToWrites(ev())) {
            expect(x.count).toBe(1);
            expect(x.bucket.toISOString()).toBe("2026-06-02T14:00:00.000Z");
            expect(x.id).toBe(`${x.metric}|${x.dim}|${encodeURIComponent(x.key)}|2026-06-02T14`);
        }
    });

    test("only all-request and all-content rollups carry latency", () => {
        const w = eventToWrites(ev({ durationMs: 30 }));
        const latency = w.filter((x) => x.msSum !== undefined);
        expect(latency.map((x) => x.metric)).toEqual(["request", "pv"]);
        expect(latency.every((x) => x.msSum === 30 && x.msMax === 30)).toBe(true);
    });

    test("failures produce bounded health rollups but no content dimensions", () => {
        const writes = eventToWrites(ev({ status: 404, path: "/.env-secret" }));
        expect(writes.map((write) => `${write.metric}:${write.dim}:${write.key}`)).toEqual([
            "request:all:_",
            "request:status:404",
            "request:outcome:not_found",
        ]);
        expect(isCountedEvent(ev({ status: 404 }))).toBe(false);
    });

    test("pageId replaces the mutable path as the page key", () => {
        const page = eventToWrites(ev({ pageId: "page-123" })).find((write) => write.dim === "page");
        expect(page?.key).toBe("page-123");
    });

    test("bots produce one bounded exclusion counter and are not counted", () => {
        expect(eventToWrites(ev({ device: "bot" }))).toEqual([
            {
                id: "excluded|reason|bot|2026-06-02T14",
                metric: "excluded",
                dim: "reason",
                key: "bot",
                bucket: new Date("2026-06-02T14:00:00.000Z"),
                count: 1,
            },
        ]);
        expect(isCountedEvent(ev({ device: "bot" }))).toBe(false);
        expect(isCountedEvent(ev())).toBe(true);
    });

    test("classifies and filters external acquisition", () => {
        const search = eventToWrites(ev({ referrerHost: "www.google.com" }));
        expect(search.find((write) => write.dim === "acquisition")?.key).toBe("search");
        expect(search.find((write) => write.dim === "referrer")?.key).toBe("www.google.com");

        const ignored = eventToWrites(ev({ referrerHost: "spam.example" }), {
            requirePageId: false,
            ignoredReferrerHosts: ["spam.example"],
        });
        expect(ignored.some((write) => write.dim === "referrer" || write.dim === "acquisition")).toBe(false);
    });

    describe("flow edge (internal navigation)", () => {
        test("same-origin fromPath adds an unambiguous flow edge", () => {
            const w = eventToWrites(ev({ fromPath: "/home", path: "/about" }));
            const flow = w.find((x) => x.metric === "flow")!;
            expect(flow.dim).toBe("edge");
            expect(flow.key).toBe('["/home","/about"]');
            expect(flow.id).toBe("flow|edge|%5B%22%2Fhome%22%2C%22%2Fabout%22%5D|2026-06-02T14");
            expect(flow.count).toBe(1);
        });
        test("no fromPath produces no flow rollup", () => {
            expect(eventToWrites(ev()).some((write) => write.metric === "flow")).toBe(false);
        });
        test("self-loop produces no flow rollup", () => {
            expect(
                eventToWrites(ev({ fromPath: "/about", path: "/about" })).some((write) => write.metric === "flow"),
            ).toBe(false);
        });
        test("bots never emit a flow edge", () => {
            expect(
                eventToWrites(ev({ device: "bot", fromPath: "/home", path: "/about" })).some(
                    (write) => write.metric === "flow",
                ),
            ).toBe(false);
        });
    });
});
