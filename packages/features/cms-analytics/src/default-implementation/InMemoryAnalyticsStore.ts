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
import type { RollupUpsert } from "../core/eventToWrites";
import { eventToWrites, isCountedEvent } from "../core/eventToWrites";
import {
    readMemoryFlows,
    readMemoryHealth,
    readMemorySummary,
    readMemoryTimeseries,
    readMemoryTop,
} from "./memory/readAnalytics";
import { MemoryHllStore } from "./memory/MemoryHllStore";

/**
 * In-memory AnalyticsStore — the dep-free reference implementation, for dev and tests.
 * Mirrors the Mongo counter and HLL++ semantics with no persistence dependency.
 */
export class InMemoryAnalyticsStore implements AnalyticsStore {
    private _rollups = new Map<string, RollupUpsert>(); // keyed by rollup id
    private readonly policy: AnalyticsCollectionPolicy;
    private readonly hll: MemoryHllStore;

    constructor(config: AnalyticsStoreConfig = {}) {
        this.policy = resolveAnalyticsPolicy(config.policy);
        this.hll = new MemoryHllStore(config.hllStripes ?? 4);
    }

    async init(): Promise<void> {}

    async record(event: AnalyticsEvent): Promise<void> {
        for (const w of eventToWrites(event, this.policy)) {
            this._merge(w);
        }
        if (isCountedEvent(event, this.policy) && this.policy.visitorEstimation && event.visitorHash) {
            this.hll.record(event.ts, event.visitorHash);
        }
    }

    private _merge(w: RollupUpsert): void {
        const cur = this._rollups.get(w.id);
        if (!cur) {
            this._rollups.set(w.id, { ...w });
            return;
        }
        cur.count += w.count;
        if (w.msSum !== undefined) {
            cur.msSum = (cur.msSum ?? 0) + w.msSum;
        }
        if (w.msMax !== undefined) {
            cur.msMax = Math.max(cur.msMax ?? 0, w.msMax);
        }
    }

    async finalizeVisitors(before: Date): Promise<void> {
        for (const rollup of this.hll.finalize(before, this.policy.rollupRetentionDays)) {
            this._rollups.set(rollup.id, rollup);
        }
    }

    async summary(from: Date, to: Date): Promise<AnalyticsSummary> {
        return readMemorySummary([...this._rollups.values()], from, to);
    }

    async timeseries(q: RangeQuery): Promise<TimeBucket[]> {
        return readMemoryTimeseries([...this._rollups.values()], q);
    }

    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return this.topPages(from, to, limit);
    }
    topPages(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return Promise.resolve(readMemoryTop([...this._rollups.values()], "pv", "page", from, to, limit));
    }
    breakdown(dim: "status" | "device" | "browser" | "exclusion", from: Date, to: Date): Promise<KeyCount[]> {
        const metric = dim === "status" ? "request" : dim === "exclusion" ? "excluded" : "pv";
        if (dim === "exclusion") {
            return Promise.resolve(readMemoryTop([...this._rollups.values()], metric, "reason", from, to, 0));
        }
        return Promise.resolve(readMemoryTop([...this._rollups.values()], metric, dim, from, to, 0));
    }
    entries(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return Promise.resolve(readMemoryTop([...this._rollups.values()], "entry", "page", from, to, limit));
    }
    topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return Promise.resolve(readMemoryTop([...this._rollups.values()], "pv", "referrer", from, to, limit));
    }

    async flows(from: Date, to: Date, limit: number): Promise<FlowCount[]> {
        return readMemoryFlows([...this._rollups.values()], from, to, limit);
    }

    async health(from: Date, to: Date): Promise<AnalyticsHealthSummary> {
        return readMemoryHealth([...this._rollups.values()], from, to);
    }
}
