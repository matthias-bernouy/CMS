import { describe, expect, test } from "bun:test";
import {
    BufferedEndpointPerformanceRecorder,
    InMemoryEndpointPerformanceStore,
    type EndpointPerformanceQuery,
} from "@bernouy/cms-analytics";

const baseQuery = {
    range: "1h",
    sort: "requests",
    order: "desc",
    limit: 50,
} as const satisfies EndpointPerformanceQuery;

describe("InMemoryEndpointPerformanceStore", () => {
    test("merges flushes into the same local dashboard projection", async () => {
        let clock = new Date("2026-07-23T12:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = new BufferedEndpointPerformanceRecorder(store, {
            collectorId: "local-dev",
            now: () => clock,
        });

        recorder.observe({
            ts: clock,
            surface: "control",
            endpointUrn: "urn:commerce:list-products",
            method: "GET",
            status: 200,
            stagesMs: { cms_auth: 10, cms_upstream: 60, cms_total: 80 },
            counters: { edge_db_calls: 2 },
        });
        await recorder.flush();

        clock = new Date("2026-07-23T12:00:01.000Z");
        recorder.observe({
            ts: clock,
            surface: "control",
            endpointUrn: "urn:commerce:list-products",
            method: "GET",
            status: 201,
            stagesMs: { cms_auth: 12, cms_upstream: 70, cms_total: 90 },
            counters: { edge_db_calls: 1 },
        });
        recorder.observe({
            ts: clock,
            surface: "control",
            endpointUrn: "urn:commerce:list-products",
            method: "GET",
            status: 503,
            stagesMs: { cms_auth: 15, cms_upstream: 350, cms_total: 420 },
            counters: { edge_db_calls: 4 },
        });
        await recorder.flush();

        const dashboard = await store.dashboard(baseQuery, new Date("2026-07-23T12:00:02.000Z"));
        expect(dashboard.summary).toEqual({
            requests: 3,
            errors: 1,
            errorRate: 1 / 3,
            p50Ms: 100,
            p95Ms: 420,
            p99Ms: 420,
            maxMs: 420,
        });
        expect(dashboard.endpoints).toHaveLength(1);
        expect(dashboard.timeline).toEqual([
            expect.objectContaining({
                bucket: new Date("2026-07-23T12:00:00.000Z"),
                requests: 3,
                errors: 1,
            }),
        ]);
        expect(dashboard.meta).toMatchObject({
            accepted: 3,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            collectorCountsExact: true,
            partial: false,
            stale: false,
        });

        const detail = await store.dashboard(
            { ...baseQuery, endpointUrn: "urn:commerce:list-products" },
            new Date("2026-07-23T12:00:02.000Z"),
        );
        expect(detail.detail?.statuses).toEqual([
            { statusClass: "2xx", count: 2 },
            { statusClass: "5xx", count: 1 },
        ]);
        expect(detail.detail?.stages).toContainEqual(
            expect.objectContaining({
                kind: "counter",
                stage: "edge_db_calls",
                observations: 3,
                total: 7,
                max: 4,
            }),
        );
        expect(detail.detail?.stages).toContainEqual(
            expect.objectContaining({
                kind: "duration",
                stage: "cms_upstream",
                observations: 3,
                coverage: 1,
            }),
        );
    });

    test("applies surface filters without filtering global collector health", async () => {
        const clock = new Date("2026-07-23T12:00:00.000Z");
        const store = new InMemoryEndpointPerformanceStore({ now: () => clock });
        const recorder = new BufferedEndpointPerformanceRecorder(store, {
            collectorId: "local-dev",
            now: () => clock,
        });
        for (const surface of ["control", "delivery"] as const) {
            recorder.observe({
                ts: clock,
                surface,
                endpointUrn: "urn:commerce:list-products",
                method: "GET",
                status: 200,
                stagesMs: { cms_total: 25 },
            });
        }
        await recorder.flush();

        const dashboard = await store.dashboard(
            { ...baseQuery, surface: "delivery" },
            new Date("2026-07-23T12:00:01.000Z"),
        );
        expect(dashboard.summary.requests).toBe(1);
        expect(dashboard.endpoints).toEqual([
            expect.objectContaining({ surface: "delivery", endpointUrn: "urn:commerce:list-products" }),
        ]);
        expect(dashboard.meta.accepted).toBe(2);
        expect(dashboard.meta.collectorHealthScope).toBe("global");
    });
});
