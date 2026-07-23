import { describe, expect, mock, test } from "bun:test";
import { MongoAnalyticsStore } from "@bernouy/cms-analytics/mongo";
import type { AnalyticsEvent } from "@bernouy/cms-analytics";

const event: AnalyticsEvent = {
    type: "delivery_request",
    ts: new Date("2026-06-02T14:00:00Z"),
    status: 200,
    durationMs: 12,
    contentKind: "html",
    pageId: "page-home",
    entry: true,
    visitorHash: "a".repeat(64),
    device: "desktop",
    browser: "chrome",
};

describe("MongoAnalyticsStore", () => {
    test("initializes query and TTL indexes without analytics_seen", async () => {
        const names: string[] = [];
        const createIndex = mock(async () => "index");
        const deleteMany = mock(async () => ({ deletedCount: 0 }));
        const db = {
            collection: (name: string) => {
                names.push(name);
                return { createIndex, deleteMany };
            },
        };
        await new MongoAnalyticsStore(db as never).init();
        expect(new Set(names)).toEqual(
            new Set(["analytics_rollups", "analytics_hll_sketches", "analytics_referrer_buckets", "analytics_seen"]),
        );
        expect(createIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        expect(deleteMany).toHaveBeenCalledTimes(4);
    });

    test("records counters and one register-max update without storing the hash", async () => {
        const bulkWrite = mock(async () => ({}));
        const updateOne = mock(async () => ({}));
        const db = {
            collection: (name: string) => (name === "analytics_rollups" ? { bulkWrite } : { updateOne }),
        };
        await new MongoAnalyticsStore(db as never, { hllStripes: 4 }).record(event);
        expect(bulkWrite).toHaveBeenCalledTimes(1);
        expect(updateOne).toHaveBeenCalledTimes(1);
        const serialized = JSON.stringify(updateOne.mock.calls[0]);
        expect(serialized).toContain("registers.");
        expect(serialized).not.toContain(event.visitorHash);
        expect(serialized).not.toContain("analytics_seen");
    });

    test("reads HLL estimates and request health from aggregate rollups", async () => {
        const aggregate = mock((pipeline: Array<Record<string, any>>) => {
            const match = pipeline[0]?.$match;
            let rows: unknown[] = [];
            if (match?.metric === "pv") {
                rows = [{ count: 30, msSum: 900, maxMs: 50 }];
            }
            if (match?.metric === "visitor") {
                rows = [{ count: 20, msSum: 0, maxMs: 0 }];
            }
            if (match?.metric === "request" && match?.dim === "all") {
                rows = [{ count: 40, msSum: 1_400, maxMs: 70 }];
            }
            if (match?.metric === "request" && match?.dim === "outcome") {
                rows = [
                    { _id: "not_found", count: 4 },
                    { _id: "server_error", count: 2 },
                ];
            }
            return { toArray: async () => rows };
        });
        const db = { collection: () => ({ aggregate }) };
        const summary = await new MongoAnalyticsStore(db as never).summary(
            new Date("2026-06-02"),
            new Date("2026-06-03"),
        );
        expect(summary).toMatchObject({
            views: 30,
            estimatedVisitors: 20,
            uniqueVisitors: 20,
            avgMs: 30,
            errorRate: 0.15,
        });
    });

    test("finalizes closed stripes by idempotently replacing one daily estimate", async () => {
        const updateOne = mock(async () => ({}));
        const updateMany = mock(async () => ({}));
        const sketches = {
            find: () => ({
                toArray: async () => [
                    {
                        _id: "2026-06-02|0",
                        day: new Date("2026-06-02"),
                        stripe: 0,
                        precision: 12,
                        registers: { "1": 3 },
                        profileVersion: "privacy-strict-v1",
                        expiresAt: new Date("2026-06-05"),
                    },
                    {
                        _id: "2026-06-02|1",
                        day: new Date("2026-06-02"),
                        stripe: 1,
                        precision: 12,
                        registers: { "2": 4 },
                        profileVersion: "privacy-strict-v1",
                        expiresAt: new Date("2026-06-05"),
                    },
                ],
            }),
            updateMany,
        };
        const db = {
            collection: (name: string) => (name === "analytics_rollups" ? { updateOne } : sketches),
        };
        const store = new MongoAnalyticsStore(db as never);
        await store.finalizeVisitors(new Date("2026-06-03"));
        await store.finalizeVisitors(new Date("2026-06-03"));
        expect(updateOne).toHaveBeenCalledTimes(2);
        expect(updateOne.mock.calls[0]?.[1]).toMatchObject({ $set: { count: 2 } });
        expect(updateOne.mock.calls[0]?.[1]).not.toHaveProperty("$inc");
        expect(updateMany).toHaveBeenCalledTimes(2);
    });

    test("maps strict dimensions to bounded counter families", async () => {
        const pipelines: Array<Array<Record<string, any>>> = [];
        const aggregate = mock((pipeline: Array<Record<string, any>>) => {
            pipelines.push(pipeline);
            return { toArray: async () => [] };
        });
        const store = new MongoAnalyticsStore({ collection: () => ({ aggregate }) } as never);
        const from = new Date("2026-06-02");
        const to = new Date("2026-06-03");
        await store.breakdown("status", from, to);
        await store.breakdown("exclusion", from, to);
        await store.entries(from, to, 10);
        expect(pipelines.map((pipeline) => pipeline[0]?.$match)).toEqual([
            expect.objectContaining({ metric: "request", dim: "status" }),
            expect.objectContaining({ metric: "excluded", dim: "reason" }),
            expect.objectContaining({ metric: "entry", dim: "page" }),
        ]);
    });
});
