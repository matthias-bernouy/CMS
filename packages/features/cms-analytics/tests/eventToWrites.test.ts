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
    test("a pageview yields 5 rollups (all|path|status|device|browser)", () => {
        const w = eventToWrites(ev());
        expect(w.map((x) => `${x.dim}:${x.key}`)).toEqual([
            "all:_",
            "path:/about",
            "status:200",
            "device:desktop",
            "browser:chrome",
        ]);
    });

    test("each rollup has count 1, metric pv, the hour bucket and a deterministic id", () => {
        for (const x of eventToWrites(ev())) {
            expect(x.count).toBe(1);
            expect(x.metric).toBe("pv");
            expect(x.bucket.toISOString()).toBe("2026-06-02T14:00:00.000Z");
            expect(x.id).toBe(`pv|${x.dim}|${x.key}|2026-06-02T14`);
        }
    });

    test("only the 'all' rollup carries latency (msSum/msMax)", () => {
        const w = eventToWrites(ev({ durationMs: 30 }));
        const all = w.find((x) => x.dim === "all")!;
        expect(all.msSum).toBe(30);
        expect(all.msMax).toBe(30);
        expect(w.filter((x) => x.dim !== "all").every((x) => x.msSum === undefined && x.msMax === undefined)).toBe(
            true,
        );
    });

    test("bots produce no writes and are not counted", () => {
        expect(eventToWrites(ev({ device: "bot" }))).toEqual([]);
        expect(isCountedEvent(ev({ device: "bot" }))).toBe(false);
        expect(isCountedEvent(ev())).toBe(true);
    });

    describe("flow edge (internal navigation)", () => {
        test("same-origin fromPath adds a 6th flow|edge rollup from>to", () => {
            const w = eventToWrites(ev({ fromPath: "/home", path: "/about" }));
            expect(w).toHaveLength(6);
            const flow = w.find((x) => x.metric === "flow")!;
            expect(flow.dim).toBe("edge");
            expect(flow.key).toBe("/home>/about");
            expect(flow.id).toBe("flow|edge|/home>/about|2026-06-02T14");
            expect(flow.count).toBe(1);
        });
        test("no fromPath → no flow rollup (5 writes)", () => {
            expect(eventToWrites(ev())).toHaveLength(5);
        });
        test("self-loop (fromPath === path, e.g. reload) → no flow rollup", () => {
            expect(eventToWrites(ev({ fromPath: "/about", path: "/about" }))).toHaveLength(5);
        });
        test("bots never emit a flow edge", () => {
            expect(eventToWrites(ev({ device: "bot", fromPath: "/home", path: "/about" }))).toEqual([]);
        });
    });
});
