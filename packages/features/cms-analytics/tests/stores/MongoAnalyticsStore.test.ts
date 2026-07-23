import { describe, expect, mock, test } from "bun:test";
import { MongoAnalyticsStore } from "@bernouy/cms-analytics/mongo";

describe("MongoAnalyticsStore", () => {
    test("initializes rollup and visitor indexes", async () => {
        const rollupIndex = mock(async () => "rollup-index");
        const seenIndex = mock(async () => "seen-index");
        const db = {
            collection: (name: string) => ({
                createIndex: name === "analytics_rollups" ? rollupIndex : seenIndex,
            }),
        };

        await new MongoAnalyticsStore(db as never).init();

        expect(rollupIndex).toHaveBeenCalledWith({ metric: 1, dim: 1, bucket: 1 });
        expect(seenIndex).toHaveBeenCalledWith({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    });

    test("reads content summary and request health from separate aggregates", async () => {
        const aggregate = mock((pipeline: Array<Record<string, any>>) => {
            const match = pipeline[0]?.$match;
            let rows: unknown[] = [];
            if (match?.metric === "pv") {
                rows = [{ count: 3, msSum: 90, maxMs: 50 }];
            } else if (match?.metric === "uv") {
                rows = [{ count: 2, msSum: 0, maxMs: 0 }];
            } else if (match?.metric === "request" && match?.dim === "all") {
                rows = [{ count: 4, msSum: 140, maxMs: 70 }];
            } else if (match?.metric === "request" && match?.dim === "outcome") {
                rows = [
                    { _id: "not_found", count: 1 },
                    { _id: "server_error", count: 1 },
                ];
            }
            return { toArray: async () => rows };
        });
        const rollups = { aggregate };
        const db = {
            collection: (name: string) => (name === "analytics_rollups" ? rollups : {}),
        };
        const store = new MongoAnalyticsStore(db as never);
        const from = new Date("2026-06-02T00:00:00.000Z");
        const to = new Date("2026-06-03T00:00:00.000Z");

        expect(await store.summary(from, to)).toEqual({
            views: 3,
            uniqueVisitors: 2,
            visitorDays: 2,
            averageDailyVisitors: 2,
            avgMs: 30,
            errorRate: 0.5,
        });
        expect(await store.health(from, to)).toEqual({
            requests: 4,
            notFound: 1,
            clientErrors: 1,
            serverErrors: 1,
            avgMs: 35,
            maxMs: 70,
        });
    });

    test("reads status breakdowns from request counters", async () => {
        const pipelines: Array<Array<Record<string, any>>> = [];
        const aggregate = mock((pipeline: Array<Record<string, any>>) => {
            pipelines.push(pipeline);
            return { toArray: async () => [] };
        });
        const db = {
            collection: () => ({ aggregate }),
        };
        const store = new MongoAnalyticsStore(db as never);
        const from = new Date("2026-06-02T00:00:00.000Z");
        const to = new Date("2026-06-03T00:00:00.000Z");

        await store.breakdown("status", from, to);
        await store.breakdown("device", from, to);

        expect(pipelines[0]?.[0]?.$match).toMatchObject({ metric: "request", dim: "status" });
        expect(pipelines[1]?.[0]?.$match).toMatchObject({ metric: "pv", dim: "device" });
    });
});
