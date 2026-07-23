import { describe, expect, mock, test } from "bun:test";
import type { EndpointPerformanceQuery } from "@bernouy/cms-analytics";
import { MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";

const now = new Date("2026-07-23T12:02:00.000Z");
const baseQuery = {
    sort: "p95",
    order: "desc",
    limit: 20,
} as const;

describe("Mongo endpoint performance projection", () => {
    test("uses the exact timeline resolution and treats a current idle heartbeat as healthy", async () => {
        for (const [range, bucketMs] of [
            ["1h", 300_000],
            ["24h", 900_000],
            ["7d", 3_600_000],
        ] as const) {
            const snapshot = {
                summary: [],
                timeline: [],
                endpoints: [],
                health: [
                    {
                        accepted: 0,
                        dropped: 0,
                        invalid: 0,
                        flushFailures: 0,
                        uncertain: 0,
                        lastFlushAt: now,
                    },
                ],
            };
            const aggregate = mock(() => ({ toArray: async () => [snapshot] }));
            const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
            const dashboard = await store.dashboard({ ...baseQuery, range }, now);
            expect(dashboard.meta).toMatchObject({ bucketMs, rollupBucketMs: 300_000, stale: false });
        }
    });

    test("returns edge database calls as a count summary with explicit units", async () => {
        const query: EndpointPerformanceQuery = {
            ...baseQuery,
            range: "1h",
            endpointUrn: "urn:commerce:products",
        };
        const snapshot = {
            summary: [],
            timeline: [],
            endpoints: [],
            health: [],
            detailStages: [
                {
                    requests: 2,
                    cms_totalCount: 2,
                    cms_totalSumMs: 360,
                    cms_totalMaxMs: 180,
                    cms_totalBin7: 2,
                    edge_db_callsObservations: 2,
                    edge_db_callsSum: 5,
                    edge_db_callsMax: 3,
                },
            ],
            detailStatuses: [{ _id: "2xx", count: 2 }],
        };
        const aggregate = mock(() => ({ toArray: async () => [snapshot] }));
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        const dashboard = await store.dashboard(query, now);

        expect(dashboard.detail?.stages.find((stage) => stage.stage === "edge_db_calls")).toEqual({
            kind: "counter",
            unit: "count",
            stage: "edge_db_calls",
            observations: 2,
            coverage: 1,
            total: 5,
            avg: 2.5,
            max: 3,
        });
        expect(dashboard.detail?.stages.find((stage) => stage.stage === "cms_total")).toMatchObject({
            kind: "duration",
            unit: "ms",
            p95Ms: 180,
            maxMs: 180,
        });
    });

    test("clamps Mongo histogram projections by their measured maximum", async () => {
        const pipelines: unknown[][] = [];
        const aggregate = mock((pipeline: unknown[]) => {
            pipelines.push(pipeline);
            return { toArray: async () => [{ summary: [], timeline: [], endpoints: [], health: [] }] };
        });
        const store = new MongoEndpointPerformanceStore({ collection: () => ({ aggregate }) } as never);
        await store.dashboard({ ...baseQuery, range: "1h" }, now);
        const serialized = JSON.stringify(pipelines[0]);
        expect(serialized).toContain('"$min":[200,"$latencyMaxMs"]');
    });
});
