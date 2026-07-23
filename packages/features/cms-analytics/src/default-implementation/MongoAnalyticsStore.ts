import type { Collection, Db, AnyBulkWriteOperation } from "mongodb";
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
import { eventToWrites, isCountedEvent } from "../core/rollups/eventToWrites";
import { readFlows, readTimeseries, readTop } from "./mongo/readSeries";
import { readHealth, readSummary } from "./mongo/readSummaries";
import { finalizeHllSketches, updateHllSketch } from "./mongo/hllSketches";
import { readReferrerBuckets, updateReferrerBucket } from "./mongo/referrerBuckets";
import type { HllSketchDoc, ReferrerBucketDoc, RollupDoc } from "./mongo/types";
import { isIgnoredReferrer } from "../core/collection/analyticsPolicy";
import { mergeKeyCounts } from "../core/referrers/FrequentItems";

/** NB: only `type` imports from `mongodb` → no runtime coupling; the `Db` is injected by the caller. */
export type MongoAnalyticsStoreConfig = AnalyticsStoreConfig & {
    /** Prefix prepended to collection names. Default `""` (single-tenant). */
    collectionPrefix?: string;
};

/** Counter-at-write AnalyticsStore on MongoDB. Reads are aggregation pipelines over pre-bucketed rollups. */
export class MongoAnalyticsStore implements AnalyticsStore {
    private readonly _prefix: string;
    private readonly policy: AnalyticsCollectionPolicy;
    private readonly hllStripes: number;
    private nextStripe = 0;

    constructor(
        private readonly db: Db,
        config: MongoAnalyticsStoreConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
        this.policy = resolveAnalyticsPolicy(config.policy);
        this.hllStripes = config.hllStripes ?? 4;
    }

    private get rollups(): Collection<RollupDoc> {
        return this.db.collection<RollupDoc>(this._prefix + "analytics_rollups");
    }
    private get sketches(): Collection<HllSketchDoc> {
        return this.db.collection<HllSketchDoc>(this._prefix + "analytics_hll_sketches");
    }
    private get referrerBuckets(): Collection<ReferrerBucketDoc> {
        return this.db.collection<ReferrerBucketDoc>(this._prefix + "analytics_referrer_buckets");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.rollups.createIndex({ metric: 1, dim: 1, bucket: 1 }),
            this.rollups.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            this.sketches.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            this.sketches.createIndex({ day: 1, stripe: 1 }),
            this.referrerBuckets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            this.referrerBuckets.createIndex({ bucket: 1 }),
        ]);
    }

    async record(event: AnalyticsEvent): Promise<void> {
        const observation = this.applyReferrerPolicy(event);
        const ops: AnyBulkWriteOperation<RollupDoc>[] = eventToWrites(observation, this.policy).map((w) => {
            const inc: Record<string, number> = { count: w.count };
            if (w.msSum !== undefined) {
                inc.msSum = w.msSum;
            }
            const update: Record<string, unknown> = {
                $inc: inc,
                $setOnInsert: {
                    metric: w.metric,
                    dim: w.dim,
                    key: w.key,
                    bucket: w.bucket,
                    expiresAt: w.expiresAt,
                },
            };
            if (w.msMax !== undefined) {
                update.$max = { msMax: w.msMax };
            }
            return { updateOne: { filter: { _id: w.id }, update, upsert: true } } as AnyBulkWriteOperation<RollupDoc>;
        });
        if (ops.length > 0) {
            await this.rollups.bulkWrite(ops, { ordered: true });
        }
        await Promise.all([
            isCountedEvent(observation, this.policy) && this.policy.visitorEstimation && observation.visitorHash
                ? updateHllSketch(
                      this.sketches,
                      observation.ts,
                      observation.visitorHash,
                      this.nextStripe++ % this.hllStripes,
                  )
                : Promise.resolve(),
            isCountedEvent(observation, this.policy) && observation.entry && observation.referrerDomain
                ? updateReferrerBucket(
                      this.referrerBuckets,
                      observation.ts,
                      observation.referrerDomain,
                      this.policy.referrerCapacity,
                      this.policy.rollupRetentionDays,
                  )
                : Promise.resolve(),
        ]);
    }

    async finalizeVisitors(before: Date): Promise<void> {
        await finalizeHllSketches(this.sketches, this.rollups, before, this.policy.rollupRetentionDays);
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
        return readTop(this.rollups, "pv", "page", from, to, limit);
    }
    breakdown(dim: "status" | "device" | "browser" | "exclusion", from: Date, to: Date): Promise<KeyCount[]> {
        if (dim === "exclusion") {
            return readTop(this.rollups, "excluded", "reason", from, to, 0);
        }
        return readTop(this.rollups, dim === "status" ? "request" : "pv", dim, from, to, 0);
    }
    entries(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return readTop(this.rollups, "entry", "page", from, to, limit);
    }
    async topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        const [noExternal, external] = await Promise.all([
            readTop(this.rollups, "pv", "referrer", from, to, 0),
            readReferrerBuckets(this.referrerBuckets, from, to),
        ]);
        return mergeKeyCounts([noExternal, external], limit);
    }
    flows(from: Date, to: Date, limit: number): Promise<FlowCount[]> {
        return readFlows(this.rollups, from, to, limit);
    }
    health(from: Date, to: Date): Promise<AnalyticsHealthSummary> {
        return readHealth(this.rollups, from, to);
    }

    private applyReferrerPolicy(event: AnalyticsEvent): AnalyticsEvent {
        return event.referrerDomain && isIgnoredReferrer(event.referrerDomain, this.policy)
            ? { ...event, referrerDomain: undefined }
            : event;
    }
}
