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
    test("returns an explicit empty dashboard with bounded operational metadata", async () => {
        const pipelines: unknown[][] = [];
        const aggregate = mock((pipeline: unknown[]) => {
            pipelines.push(pipeline);
            return { toArray: async () => [] };
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
            generatedAt: now,
            partial: false,
            stale: false,
            accepted: 0,
            dropped: 0,
        });
        expect(pipelines).toHaveLength(6);
        const serialized = JSON.stringify(pipelines);
        expect(serialized).toContain('"statusClass":"2xx"');
        expect(serialized).toContain('"$switch"');
    });

    test("computes freshness and partial state from aggregate-only rows", async () => {
        const responses = [
            [
                {
                    requests: 10,
                    errors: 2,
                    errorRate: 0.2,
                    p50Ms: 200,
                    p95Ms: 1_000,
                    p99Ms: 1_500,
                    maxMs: 1_300,
                    lastObservationAt: new Date("2026-07-23T11:40:00.000Z"),
                },
            ],
            [],
            [],
            [],
            [],
            [{ accepted: 10, dropped: 1, invalid: 0, flushFailures: 1, lastFlushAt: now }],
        ];
        const aggregate = mock(() => ({ toArray: async () => responses.shift() ?? [] }));
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        const dashboard = await store.dashboard(query, now);

        expect(dashboard.summary).toMatchObject({ requests: 10, errors: 2, p95Ms: 1_000 });
        expect(dashboard.meta).toMatchObject({
            accepted: 10,
            dropped: 1,
            flushFailures: 1,
            partial: true,
            stale: true,
            lastFlushAt: now,
        });
    });

    test("sorts computed percentile before applying the endpoint limit", async () => {
        const pipelines: unknown[][] = [];
        const aggregate = mock((pipeline: unknown[]) => {
            pipelines.push(pipeline);
            return { toArray: async () => [] };
        });
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        await store.dashboard(query, now);
        const endpointPipeline = pipelines[2] as Array<Record<string, unknown>>;
        const sortIndex = endpointPipeline.findIndex((stage) => "$sort" in stage);
        const limitIndex = endpointPipeline.findIndex((stage) => "$limit" in stage);
        expect(sortIndex).toBeGreaterThan(-1);
        expect(sortIndex).toBeLessThan(limitIndex);
        expect(endpointPipeline[sortIndex]).toEqual({
            $sort: { p95Ms: -1, endpointUrn: 1, surface: 1, method: 1 },
        });
    });
});
