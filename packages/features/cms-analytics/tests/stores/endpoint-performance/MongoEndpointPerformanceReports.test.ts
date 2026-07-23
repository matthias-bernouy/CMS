import { describe, expect, mock, test } from "bun:test";
import type { EndpointPerformanceQuery } from "@bernouy/cms-analytics";
import { MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";

const now = new Date("2026-07-23T12:02:00.000Z");
const query: EndpointPerformanceQuery = {
    range: "24h",
    surface: "delivery",
    endpointUrn: "urn:commerce:products",
    method: "GET",
    statusClass: "2xx",
    sort: "p95",
    order: "desc",
    limit: 20,
};

describe("MongoEndpointPerformanceStore reports", () => {
    test("returns an explicit stale empty dashboard until a collector heartbeat exists", async () => {
        const pipelines: unknown[][] = [];
        const aggregate = mock((pipeline: unknown[]) => {
            pipelines.push(pipeline);
            return { toArray: async () => [{ summary: [], timeline: [], endpoints: [], health: [] }] };
        });
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        const dashboard = await store.dashboard(query, now);

        expect(dashboard.summary).toEqual({
            requests: 0,
            errors: 0,
            errorRate: null,
            p50Ms: null,
            p95Ms: null,
            p99Ms: null,
            maxMs: null,
        });
        expect(dashboard.detail).toBeNull();
        expect(dashboard.meta).toMatchObject({
            query,
            bucketMs: 900_000,
            rollupBucketMs: 300_000,
            collectorHealthScope: "global",
            collectorCountsExact: true,
            partial: false,
            stale: true,
            accepted: 0,
            dropped: 0,
        });
        expect(pipelines).toHaveLength(1);
        expect(JSON.stringify(pipelines[0]?.[0])).toContain('"rollupVersion":"endpoint-performance-v1"');
        expect(JSON.stringify(pipelines[0]?.[0])).toContain('"statusClass":"2xx"');
    });

    test("reports global uncertain collector health without pretending it follows endpoint filters", async () => {
        const snapshot = {
            summary: [
                {
                    requests: 5,
                    errors: 0,
                    errorRate: 0,
                    p50Ms: 180,
                    p95Ms: 180,
                    p99Ms: 180,
                    maxMs: 180,
                    lastObservationAt: new Date("2026-07-23T11:40:00.000Z"),
                },
            ],
            timeline: [],
            endpoints: [],
            health: [
                {
                    accepted: 25,
                    dropped: 1,
                    invalid: 0,
                    flushFailures: 2,
                    uncertain: 1,
                    lastFlushAt: now,
                },
            ],
        };
        const aggregate = mock(() => ({ toArray: async () => [snapshot] }));
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        const dashboard = await store.dashboard(query, now);

        expect(dashboard.summary).toMatchObject({ requests: 5, p95Ms: 180, maxMs: 180 });
        expect(dashboard.meta).toMatchObject({
            accepted: 25,
            dropped: 1,
            flushFailures: 2,
            collectorHealthScope: "global",
            collectorCountsExact: false,
            partial: true,
            stale: true,
            lastFlushAt: now,
        });
    });

    test("uses one facet snapshot and sorts computed percentiles before limiting endpoints", async () => {
        const pipelines: unknown[][] = [];
        const aggregate = mock((pipeline: unknown[]) => {
            pipelines.push(pipeline);
            return { toArray: async () => [{ summary: [], timeline: [], endpoints: [], health: [] }] };
        });
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        await store.dashboard(query, now);

        const pipeline = pipelines[0] as Array<Record<string, any>>;
        const endpointPipeline = pipeline[1]?.$facet.endpoints as Array<Record<string, unknown>>;
        const sortIndex = endpointPipeline.findIndex((stage) => "$sort" in stage);
        const limitIndex = endpointPipeline.findIndex((stage) => "$limit" in stage);
        expect(sortIndex).toBeGreaterThan(-1);
        expect(sortIndex).toBeLessThan(limitIndex);
        expect(endpointPipeline[sortIndex]).toEqual({
            $sort: { p95Ms: -1, endpointUrn: 1, surface: 1, method: 1 },
        });
        expect(aggregate).toHaveBeenCalledTimes(1);
    });
});
