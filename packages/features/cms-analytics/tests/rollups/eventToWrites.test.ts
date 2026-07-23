import { describe, expect, test } from "bun:test";
import { eventToWrites, isCountedEvent } from "cms-analytics/core/rollups/eventToWrites";
import type { AnalyticsEvent } from "cms-analytics/interfaces/AnalyticsEvent";

const event = (over: Partial<AnalyticsEvent> = {}): AnalyticsEvent => ({
    type: "delivery_request",
    ts: new Date("2026-06-02T14:37:45.123Z"),
    status: 200,
    durationMs: 12,
    contentKind: "html",
    pageId: "page-about",
    entry: true,
    visitorHash: "a".repeat(64),
    device: "desktop",
    browser: "chrome",
    ...over,
});

describe("eventToWrites", () => {
    test("writes bounded health and stable-page content counters", () => {
        const writes = eventToWrites(event());
        expect(writes.map((write) => `${write.metric}:${write.dim}:${write.key}`)).toEqual([
            "request:all:_",
            "request:status:200",
            "request:outcome:success",
            "request:latency:0-100",
            "pv:all:_",
            "pv:page:page-about",
            "pv:status:200",
            "pv:device:desktop",
            "pv:browser:chrome",
            "entry:page:page-about",
            "pv:referrer:__none__",
        ]);
        expect(writes.every((write) => write.expiresAt.toISOString() === "2027-07-02T14:00:00.000Z")).toBe(true);
    });

    test("does not emit content dimensions for unresolved or failed requests", () => {
        for (const observation of [event({ pageId: undefined }), event({ status: 404 })]) {
            const writes = eventToWrites(observation);
            expect(writes.every((write) => write.metric === "request")).toBe(true);
            expect(isCountedEvent(observation)).toBe(false);
        }
    });

    test("maps automation to one exclusion counter and records no request health", () => {
        const writes = eventToWrites(event({ exclusionReason: "automation", visitorHash: undefined }));
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({ metric: "excluded", dim: "reason", key: "automation", count: 1 });
        expect(isCountedEvent(event({ exclusionReason: "automation" }))).toBe(false);
    });

    test("uses structured stable page ids for direct internal transitions", () => {
        const writes = eventToWrites(event({ previousPageId: "page-home", entry: false }));
        const flow = writes.find((write) => write.metric === "flow");
        expect(flow?.key).toBe('["page-home","page-about"]');
        expect(writes.some((write) => write.metric === "entry")).toBe(false);
    });

    test("keeps the keyspace bounded and never writes referrer or campaign values", () => {
        const writes = eventToWrites(event({ referrerDomain: "example.com" }));
        expect(writes.some((write) => write.dim === "referrer" || write.dim === "campaign")).toBe(false);
        expect(eventToWrites(event(), { enabled: false })).toEqual([]);
    });

    test("assigns fixed latency bins and deterministic hourly ids", () => {
        const writes = eventToWrites(event({ durationMs: 2_501 }));
        expect(writes.find((write) => write.dim === "latency")?.key).toBe("2501+");
        for (const write of writes) {
            expect(write.bucket.toISOString()).toBe("2026-06-02T14:00:00.000Z");
            expect(write.id).toBe(`${write.metric}|${write.dim}|${encodeURIComponent(write.key)}|2026-06-02T14`);
        }
    });
});
