import { describe, expect, mock, test } from "bun:test";
import { BufferedEndpointPerformanceRecorder, type EndpointPerformanceObservation } from "@bernouy/cms-analytics";
import { MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";

const now = new Date("2026-07-23T12:02:00.000Z");
const observation: EndpointPerformanceObservation = {
    ts: now,
    surface: "delivery",
    endpointUrn: "urn:commerce:products",
    method: "GET",
    status: 200,
    stagesMs: { cms_total: 180, cms_upstream: 150 },
};

describe("MongoEndpointPerformanceStore writes", () => {
    test("initializes dedicated query and TTL indexes", async () => {
        const createIndex = mock(async () => "index");
        const names: string[] = [];
        const db = {
            collection(name: string) {
                names.push(name);
                return { createIndex };
            },
        };
        await new MongoEndpointPerformanceStore(db as never).init();
        expect(new Set(names)).toEqual(new Set(["analytics_source_performance_rollups"]));
        expect(createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        expect(createIndex).toHaveBeenCalledWith(
            {
                kind: 1,
                rollupVersion: 1,
                endpointUrn: 1,
                surface: 1,
                method: 1,
                statusClass: 1,
                bucket: 1,
            },
            { partialFilterExpression: { kind: "endpoint" } },
        );
        expect(createIndex).toHaveBeenCalledTimes(3);
    });

    test("flushes additive merge-safe deltas in one unordered batch", async () => {
        const bulkWrite = mock(async () => ({}));
        const db = { collection: () => ({ bulkWrite }) };
        const store = new MongoEndpointPerformanceStore(db as never);
        const recorder = new BufferedEndpointPerformanceRecorder(store, {
            collectorId: "mongo-writer",
            now: () => now,
        });
        recorder.observe(observation);
        recorder.observe({ ...observation, status: 503, stagesMs: { cms_total: 900 } });
        await recorder.flush();

        expect(bulkWrite).toHaveBeenCalledTimes(1);
        expect(bulkWrite.mock.calls[0]?.[1]).toEqual({ ordered: false });
        const operations = bulkWrite.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
        expect(operations).toHaveLength(3);
        const serialized = JSON.stringify(operations);
        expect(serialized).toContain('"$inc"');
        expect(serialized).toContain('"$max"');
        expect(serialized).toContain('"$min"');
        expect(serialized).toContain("stages.cms_total");
        expect(serialized).not.toContain("correlation");
        expect(serialized).not.toContain("targetUrl");
        const collector = operations.find(
            (operation: any) => operation.updateOne.update.$setOnInsert.kind === "collector",
        );
        expect((collector as any).updateOne.update).not.toHaveProperty("$inc");
        expect((collector as any).updateOne.update.$max).toMatchObject({
            accepted: 2,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            lastFlushAt: now,
        });
    });

    test("uses the same deterministic id for concurrent-instance dimensions", async () => {
        const operations: unknown[][] = [];
        const db = {
            collection: () => ({
                bulkWrite(value: unknown[]) {
                    operations.push(value);
                    return Promise.resolve({});
                },
            }),
        };
        for (let index = 0; index < 2; index++) {
            const recorder = new BufferedEndpointPerformanceRecorder(new MongoEndpointPerformanceStore(db as never), {
                now: () => now,
            });
            recorder.observe(observation);
            await recorder.flush();
        }
        const firstId = (operations[0]?.[0] as any).updateOne.filter._id;
        const secondId = (operations[1]?.[0] as any).updateOne.filter._id;
        expect(firstId).toBe(secondId);
        expect((operations[0]?.[0] as any).updateOne.update.$inc.requestCount).toBe(1);
        expect((operations[1]?.[0] as any).updateOne.update.$inc.requestCount).toBe(1);
    });
});
