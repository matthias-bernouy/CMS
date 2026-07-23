import type { Collection, Db } from "mongodb";
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
import { readFlows, readTimeseries, readTop } from "./mongo/readSeries";
import { readHealth, readSummary } from "./mongo/readSummaries";
import { finalizeHllSketches } from "./mongo/counters/hllSketches";
import { hasSaturatedReferrerBucket, readReferrerBuckets } from "./mongo/counters/referrerBuckets";
import { recordMongoAnalytics } from "./mongo/counters/recordAnalytics";
import { shortenMongoAnalyticsRetention } from "./mongo/counters/retention";
import type { HllSketchDoc, ReferrerBucketDoc, RollupDoc } from "./mongo/types";
import { isIgnoredReferrer } from "../core/collection/analyticsPolicy";
import { mergeKeyCounts } from "../core/referrers/FrequentItems";
import { migrateLegacyAnalytics } from "./mongo/migrateLegacyAnalytics";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "../interfaces/AnalyticsGovernance";
import { MongoAnalyticsGovernance } from "./mongo/MongoAnalyticsGovernance";

/** NB: only `type` imports from `mongodb` → no runtime coupling; the `Db` is injected by the caller. */
export type MongoAnalyticsStoreConfig = AnalyticsStoreConfig & {
    /** Prefix prepended to collection names. Default `""` (single-tenant). */
    collectionPrefix?: string;
};

/** Counter-at-write AnalyticsStore on MongoDB. Reads are aggregation pipelines over pre-bucketed rollups. */
export class MongoAnalyticsStore implements AnalyticsStore {
    private readonly _prefix: string;
    private policy: AnalyticsCollectionPolicy;
    private readonly governance: MongoAnalyticsGovernance;
    private readonly hllStripes: number;
    private nextStripe = 0;

    constructor(
        private readonly db: Db,
        config: MongoAnalyticsStoreConfig = {},
    ) {
        this._prefix = config.collectionPrefix ?? "";
        this.policy = resolveAnalyticsPolicy(config.policy);
        this.governance = new MongoAnalyticsGovernance(
            this.db.collection(this._prefix + "analytics_governance"),
            settingsFromPolicy(this.policy),
            (settings) => {
                this.policy = resolveAnalyticsPolicy({ ...this.policy, ...settings });
            },
        );
        this.hllStripes = config.hllStripes ?? 16;
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
        await migrateLegacyAnalytics(this.db, this._prefix);
        await this.governance.init();
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
        await recordMongoAnalytics(
            { rollups: this.rollups, sketches: this.sketches, referrers: this.referrerBuckets },
            observation,
            this.policy,
            this.nextStripe++ % this.hllStripes,
        );
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
    breakdown(
        dim: "status" | "device" | "browser" | "exclusion" | "latency",
        from: Date,
        to: Date,
    ): Promise<KeyCount[]> {
        if (dim === "exclusion") {
            return readTop(this.rollups, "excluded", "reason", from, to, 0);
        }
        return readTop(this.rollups, dim === "status" || dim === "latency" ? "request" : "pv", dim, from, to, 0);
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
    referrerSaturated(from: Date, to: Date): Promise<boolean> {
        return hasSaturatedReferrerBucket(this.referrerBuckets, from, to);
    }
    flows(from: Date, to: Date, limit: number): Promise<FlowCount[]> {
        return readFlows(this.rollups, from, to, limit);
    }
    health(from: Date, to: Date): Promise<AnalyticsHealthSummary> {
        return readHealth(this.rollups, from, to);
    }

    getSettings(): Promise<AnalyticsSettings> {
        return Promise.resolve(this.governance.getSettings());
    }

    async updateSettings(settings: AnalyticsSettings): Promise<AnalyticsSettings> {
        const previousRetention = this.policy.rollupRetentionDays;
        const updated = await this.governance.updateSettings(settings);
        if (updated.rollupRetentionDays < previousRetention) {
            await shortenMongoAnalyticsRetention(this.rollups, this.referrerBuckets, updated.rollupRetentionDays);
        }
        return updated;
    }

    saveComplianceSnapshot(snapshot: AnalyticsComplianceSnapshot): Promise<void> {
        return this.governance.saveSnapshot(snapshot);
    }

    latestPublishedComplianceSnapshot(): Promise<AnalyticsComplianceSnapshot | null> {
        return this.governance.latestPublished();
    }

    private applyReferrerPolicy(event: AnalyticsEvent): AnalyticsEvent {
        return event.referrerDomain && isIgnoredReferrer(event.referrerDomain, this.policy)
            ? { ...event, referrerDomain: undefined }
            : event;
    }
}

function settingsFromPolicy(policy: AnalyticsCollectionPolicy): AnalyticsSettings {
    return {
        enabled: policy.enabled,
        visitorEstimation: policy.visitorEstimation,
        rollupRetentionDays: policy.rollupRetentionDays,
        privacyNoticeUrl: "",
    };
}
