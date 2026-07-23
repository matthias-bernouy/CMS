import type { Collection, Db, AnyBulkWriteOperation, OptionalUnlessRequiredId } from "mongodb";
import type {
    AnalyticsStore,
    AnalyticsSummary,
    AnalyticsHealthSummary,
    TimeBucket,
    KeyCount,
    FlowCount,
    RangeQuery,
    AnalyticsStoreConfig,
} from "../interfaces/AnalyticsStore";
import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";
import type { AnalyticsCollectionPolicy } from "../interfaces/AnalyticsPolicy";
import { resolveAnalyticsPolicy } from "../core/collection/analyticsPolicy";
import { eventToWrites, isCountedEvent } from "../core/eventToWrites";
import { dayKey, truncateToDay, rollupId, seenId } from "../core/buckets";
import { readFlows, readTimeseries, readTop } from "./mongo/readSeries";
import { readHealth, readSummary } from "./mongo/readSummaries";
import type { RollupDoc, SeenDoc } from "./mongo/types";

/** NB: only `type` imports from `mongodb` → no runtime coupling; the `Db` is injected by the caller. */
export type MongoAnalyticsStoreConfig = AnalyticsStoreConfig & {
    /** Prefix prepended to collection names. Default `""` (single-tenant). */
    collectionPrefix?: string;
    /** TTL of the unique-visitor "seen" docs, in hours. Default 48. */
    seenTtlHours?: number;
};

/** Counter-at-write AnalyticsStore on MongoDB. Reads are aggregation pipelines over pre-bucketed rollups. */
export class MongoAnalyticsStore implements AnalyticsStore {
    private readonly _prefix: string;
    private readonly _ttlMs: number;
    private readonly policy: AnalyticsCollectionPolicy;

    constructor(
        private readonly db: Db,
        config: MongoAnalyticsStoreConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
        this._ttlMs = (config.seenTtlHours ?? 48) * 3_600_000;
        this.policy = resolveAnalyticsPolicy(config.policy);
    }

    private get rollups(): Collection<RollupDoc> {
        return this.db.collection<RollupDoc>(this._prefix + "analytics_rollups");
    }
    private get seen(): Collection<SeenDoc> {
        return this.db.collection<SeenDoc>(this._prefix + "analytics_seen");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.rollups.createIndex({ metric: 1, dim: 1, bucket: 1 }),
            this.seen.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        ]);
    }

    async record(event: AnalyticsEvent): Promise<void> {
        const ops: AnyBulkWriteOperation<RollupDoc>[] = eventToWrites(event, this.policy).map((w) => {
            const inc: Record<string, number> = { count: w.count };
            if (w.msSum !== undefined) {
                inc.msSum = w.msSum;
            }
            const update: Record<string, unknown> = {
                $inc: inc,
                $setOnInsert: { metric: w.metric, dim: w.dim, key: w.key, bucket: w.bucket },
            };
            if (w.msMax !== undefined) {
                update.$max = { msMax: w.msMax };
            }
            return { updateOne: { filter: { _id: w.id }, update, upsert: true } } as AnyBulkWriteOperation<RollupDoc>;
        });
        await this.rollups.bulkWrite(ops, { ordered: false });
        if (!isCountedEvent(event, this.policy)) {
            return;
        }
        await this._countVisitor(event);
    }

    /** First view of the day for this visitor → bump uv|all; a repeat throws 11000, which means "already counted". */
    private async _countVisitor(event: AnalyticsEvent): Promise<void> {
        const day = dayKey(event.ts);
        try {
            await this.seen.insertOne({
                _id: seenId(event.visitorId, day),
                expiresAt: new Date(event.ts.getTime() + this._ttlMs),
            } as OptionalUnlessRequiredId<SeenDoc>);
        } catch (e) {
            if ((e as { code?: number }).code === 11000) {
                return;
            }
            throw e;
        }
        await this.rollups.updateOne(
            { _id: rollupId("uv", "all", "_", day) },
            {
                $inc: { count: 1 },
                $setOnInsert: { metric: "uv", dim: "all", key: "_", bucket: truncateToDay(event.ts) },
            },
            { upsert: true },
        );
    }

    async summary(from: Date, to: Date): Promise<AnalyticsSummary> {
        return readSummary(this.rollups, from, to);
    }

    async timeseries(q: RangeQuery): Promise<TimeBucket[]> {
        return readTimeseries(this.rollups, q);
    }

    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return this.topPages(from, to, limit);
    }
    topPages(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return readTop(this.rollups, "pv", ["page", "path"], from, to, limit);
    }
    breakdown(dim: "status" | "device" | "browser" | "acquisition", from: Date, to: Date): Promise<KeyCount[]> {
        return readTop(this.rollups, dim === "status" ? "request" : "pv", dim, from, to, 0);
    }
    topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return readTop(this.rollups, "pv", "referrer", from, to, limit);
    }
    flows(from: Date, to: Date, limit: number): Promise<FlowCount[]> {
        return readFlows(this.rollups, from, to, limit);
    }
    health(from: Date, to: Date): Promise<AnalyticsHealthSummary> {
        return readHealth(this.rollups, from, to);
    }
}
