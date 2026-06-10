import type { Collection, Db, AnyBulkWriteOperation, OptionalUnlessRequiredId, Document } from "mongodb";
import type { AnalyticsStore, AnalyticsSummary, TimeBucket, KeyCount, RangeQuery } from "../interfaces/AnalyticsStore";
import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";
import { eventToWrites, isCountedEvent } from "../core/eventToWrites";
import { dayKey, truncateToDay, rollupId, seenId } from "../core/buckets";

/** NB: only `type` imports from `mongodb` → no runtime coupling; the `Db` is injected by the caller. */
export type MongoAnalyticsStoreConfig = {
    /** Prefix prepended to collection names. Default `""` (single-tenant). */
    collectionPrefix?: string;
    /** TTL of the unique-visitor "seen" docs, in hours. Default 48. */
    seenTtlHours?: number;
};

type RollupDoc = { _id: string; metric: string; dim: string; key: string; bucket: Date; count: number; msSum?: number; msMax?: number };
type SeenDoc = { _id: string; expiresAt: Date };

/** Counter-at-write AnalyticsStore on MongoDB. Reads are aggregation pipelines over pre-bucketed rollups. */
export class MongoAnalyticsStore implements AnalyticsStore {
    private readonly _prefix: string;
    private readonly _ttlMs: number;

    constructor(private readonly db: Db, config: MongoAnalyticsStoreConfig = {}) {
        this._prefix = config.collectionPrefix ?? "";
        this._ttlMs = (config.seenTtlHours ?? 48) * 3_600_000;
    }

    private get rollups(): Collection<RollupDoc> { return this.db.collection<RollupDoc>(this._prefix + "analytics_rollups"); }
    private get seen(): Collection<SeenDoc> { return this.db.collection<SeenDoc>(this._prefix + "analytics_seen"); }

    async init(): Promise<void> {
        await Promise.all([
            this.rollups.createIndex({ metric: 1, dim: 1, bucket: 1 }),
            this.seen.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ]);
    }

    async record(event: AnalyticsEvent): Promise<void> {
        if (!isCountedEvent(event)) return;
        const ops: AnyBulkWriteOperation<RollupDoc>[] = eventToWrites(event).map((w) => {
            const inc: Record<string, number> = { count: w.count };
            if (w.msSum !== undefined) inc.msSum = w.msSum;
            const update: Record<string, unknown> = { $inc: inc, $setOnInsert: { metric: w.metric, dim: w.dim, key: w.key, bucket: w.bucket } };
            if (w.msMax !== undefined) update.$max = { msMax: w.msMax };
            return { updateOne: { filter: { _id: w.id }, update, upsert: true } } as AnyBulkWriteOperation<RollupDoc>;
        });
        await this.rollups.bulkWrite(ops, { ordered: false });
        await this._countVisitor(event);
    }

    /** First view of the day for this visitor → bump uv|all; a repeat throws 11000, which means "already counted". */
    private async _countVisitor(event: AnalyticsEvent): Promise<void> {
        const day = dayKey(event.ts);
        try {
            await this.seen.insertOne({ _id: seenId(event.visitorId, day), expiresAt: new Date(event.ts.getTime() + this._ttlMs) } as OptionalUnlessRequiredId<SeenDoc>);
        } catch (e) {
            if ((e as { code?: number }).code === 11000) return;
            throw e;
        }
        await this.rollups.updateOne(
            { _id: rollupId("uv", "all", "_", day) },
            { $inc: { count: 1 }, $setOnInsert: { metric: "uv", dim: "all", key: "_", bucket: truncateToDay(event.ts) } },
            { upsert: true },
        );
    }

    async summary(from: Date, to: Date): Promise<AnalyticsSummary> {
        const range = { bucket: { $gte: from, $lt: to } };
        const [pv] = await this.rollups.aggregate<{ count: number; msSum: number }>([
            { $match: { metric: "pv", dim: "all", ...range } },
            { $group: { _id: null, count: { $sum: "$count" }, msSum: { $sum: "$msSum" } } },
        ]).toArray();
        const [uv] = await this.rollups.aggregate<{ count: number }>([
            { $match: { metric: "uv", dim: "all", ...range } }, { $group: { _id: null, count: { $sum: "$count" } } },
        ]).toArray();
        const [err] = await this.rollups.aggregate<{ count: number }>([
            { $match: { metric: "pv", dim: "status", key: { $gte: "400", $lt: "600" }, ...range } }, { $group: { _id: null, count: { $sum: "$count" } } },
        ]).toArray();
        const views = pv?.count ?? 0;
        return { views, uniqueVisitors: uv?.count ?? 0, avgMs: views ? Math.round((pv?.msSum ?? 0) / views) : 0, errorRate: views ? (err?.count ?? 0) / views : 0 };
    }

    async timeseries(q: RangeQuery): Promise<TimeBucket[]> {
        const rows = await this.rollups.aggregate<{ _id: Date; count: number; msSum: number; maxMs: number }>([
            { $match: { metric: "pv", dim: "all", bucket: { $gte: q.from, $lt: q.to } } },
            { $group: { _id: { $dateTrunc: { date: "$bucket", unit: q.interval } }, count: { $sum: "$count" }, msSum: { $sum: "$msSum" }, maxMs: { $max: "$msMax" } } },
            { $sort: { _id: 1 } },
        ]).toArray();
        return rows.map((r) => ({ bucket: r._id, count: r.count, avgMs: r.count ? Math.round(r.msSum / r.count) : 0, maxMs: r.maxMs }));
    }

    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]> { return this._top("path", from, to, limit); }
    breakdown(dim: "status" | "device" | "browser", from: Date, to: Date): Promise<KeyCount[]> { return this._top(dim, from, to, 0); }

    private async _top(dim: string, from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        const pipe: Document[] = [
            { $match: { metric: "pv", dim, bucket: { $gte: from, $lt: to } } },
            { $group: { _id: "$key", count: { $sum: "$count" } } },
            { $sort: { count: -1 } },
        ];
        if (limit > 0) pipe.push({ $limit: limit });
        const rows = await this.rollups.aggregate<{ _id: string; count: number }>(pipe).toArray();
        return rows.map((r) => ({ key: r._id, count: r.count }));
    }
}
