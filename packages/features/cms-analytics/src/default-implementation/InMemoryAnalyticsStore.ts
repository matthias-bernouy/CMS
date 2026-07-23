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
import type { RollupUpsert } from "../core/rollups/eventToWrites";
import { eventToWrites, isCountedEvent } from "../core/rollups/eventToWrites";
import {
    readMemoryFlows,
    readMemoryHealth,
    readMemorySummary,
    readMemoryTimeseries,
    readMemoryTop,
} from "./memory/readAnalytics";
import { MemoryHllStore } from "./memory/MemoryHllStore";
import { MemoryReferrerStore } from "./memory/MemoryReferrerStore";
import { isIgnoredReferrer } from "../core/collection/analyticsPolicy";
import { mergeKeyCounts } from "../core/referrers/FrequentItems";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "../interfaces/AnalyticsGovernance";
import { MemoryAnalyticsGovernance } from "./memory/MemoryAnalyticsGovernance";

/**
 * In-memory AnalyticsStore — the dep-free reference implementation, for dev and tests.
 * Mirrors the Mongo counter and HLL++ semantics with no persistence dependency.
 */
export class InMemoryAnalyticsStore implements AnalyticsStore {
    private _rollups = new Map<string, RollupUpsert>(); // keyed by rollup id
    private policy: AnalyticsCollectionPolicy;
    private readonly hll: MemoryHllStore;
    private readonly referrers: MemoryReferrerStore;
    private readonly governance: MemoryAnalyticsGovernance;

    constructor(config: AnalyticsStoreConfig = {}) {
        this.policy = resolveAnalyticsPolicy(config.policy);
        this.governance = new MemoryAnalyticsGovernance(settingsFromPolicy(this.policy), (settings) => {
            this.policy = resolveAnalyticsPolicy({ ...this.policy, ...settings });
        });
        this.hll = new MemoryHllStore(config.hllStripes ?? 16);
        this.referrers = new MemoryReferrerStore(this.policy.referrerCapacity);
    }

    async init(): Promise<void> {}

    async record(event: AnalyticsEvent): Promise<void> {
        const observation = this.applyReferrerPolicy(event);
        for (const w of eventToWrites(observation, this.policy)) {
            this._merge(w);
        }
        if (isCountedEvent(observation, this.policy) && this.policy.visitorEstimation && observation.visitorHash) {
            this.hll.record(observation.ts, observation.visitorHash);
        }
        if (isCountedEvent(observation, this.policy) && observation.entry && observation.referrerDomain) {
            this.referrers.record(observation.ts, observation.referrerDomain);
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
    breakdown(
        dim: "status" | "device" | "browser" | "exclusion" | "latency",
        from: Date,
        to: Date,
    ): Promise<KeyCount[]> {
        const metric = dim === "status" || dim === "latency" ? "request" : dim === "exclusion" ? "excluded" : "pv";
        if (dim === "exclusion") {
            return Promise.resolve(readMemoryTop([...this._rollups.values()], metric, "reason", from, to, 0));
        }
        return Promise.resolve(readMemoryTop([...this._rollups.values()], metric, dim, from, to, 0));
    }
    entries(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        return Promise.resolve(readMemoryTop([...this._rollups.values()], "entry", "page", from, to, limit));
    }
    topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        const noExternal = readMemoryTop([...this._rollups.values()], "pv", "referrer", from, to, 0);
        return Promise.resolve(mergeKeyCounts([noExternal, this.referrers.read(from, to)], limit));
    }
    referrerSaturated(from: Date, to: Date): Promise<boolean> {
        return Promise.resolve(this.referrers.saturated(from, to));
    }

    async flows(from: Date, to: Date, limit: number): Promise<FlowCount[]> {
        return readMemoryFlows([...this._rollups.values()], from, to, limit);
    }

    async health(from: Date, to: Date): Promise<AnalyticsHealthSummary> {
        return readMemoryHealth([...this._rollups.values()], from, to);
    }

    getSettings(): Promise<AnalyticsSettings> {
        return Promise.resolve(this.governance.getSettings());
    }

    updateSettings(settings: AnalyticsSettings): Promise<AnalyticsSettings> {
        return Promise.resolve(this.governance.updateSettings(settings));
    }

    async saveComplianceSnapshot(snapshot: AnalyticsComplianceSnapshot): Promise<void> {
        this.governance.saveSnapshot(snapshot);
    }

    async latestPublishedComplianceSnapshot(): Promise<AnalyticsComplianceSnapshot | null> {
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
