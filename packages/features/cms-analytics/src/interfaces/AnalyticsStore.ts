/**
 * The AnalyticsStore contract: one writer used by delivery and a small set of read
 * methods backing the control dashboards. Reads return pre-aggregated shapes
 * (counters/buckets), never raw events.
 */

import type { AnalyticsEvent } from "./AnalyticsEvent";
import type { AnalyticsCollectionPolicy } from "./AnalyticsPolicy";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "./AnalyticsGovernance";

/** One point of a time series: a bucket, its count, and latency for the "all" metric. */
export type TimeBucket = {
    bucket: Date;
    count: number;
    avgMs?: number;
    maxMs?: number;
};

/** A (key, count) pair — one row of a breakdown or a top-list. */
export type KeyCount = {
    key: string;
    count: number;
};

export type FlowCount = {
    from: string;
    to: string;
    count: number;
};

/** Headline numbers for the dashboard cards over a period. */
export type AnalyticsSummary = {
    views: number;
    /** @deprecated Compatibility alias for `estimatedVisitors`. */
    uniqueVisitors: number;
    /** Sum of closed-day HLL++ estimates in the selected range. */
    estimatedVisitors: number;
    visitorDays: number;
    averageDailyVisitors: number;
    avgMs: number | null;
    /** Request error rate, including non-content responses. */
    errorRate: number | null;
};

export type AnalyticsHealthSummary = {
    requests: number;
    notFound: number;
    clientErrors: number;
    serverErrors: number;
    avgMs: number | null;
    maxMs: number | null;
};

/** A time-range query plus the bucketing granularity for the series. */
export type RangeQuery = {
    from: Date;
    to: Date;
    interval: "hour" | "day";
};

export interface AnalyticsStore {
    /** Create indexes; idempotent. Called once at boot. */
    init(): Promise<void>;
    /** Record one aggregate observation; meant to be called fire-and-forget. */
    record(event: AnalyticsEvent): Promise<void>;
    /** Idempotently finalize visitor sketches for UTC days closed before this instant. */
    finalizeVisitors(before: Date): Promise<void>;
    /** Headline numbers over [from, to). */
    summary(from: Date, to: Date): Promise<AnalyticsSummary>;
    /** Views (+ latency) per bucket over the range. */
    timeseries(q: RangeQuery): Promise<TimeBucket[]>;
    /** @deprecated Compatibility alias for `topPages`. */
    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Most-viewed stable page ids, falling back to paths for legacy producers. */
    topPages(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Counts grouped by a dimension over [from, to); status covers all non-bot requests. */
    breakdown(
        dim: "status" | "device" | "browser" | "exclusion" | "latency",
        from: Date,
        to: Date,
    ): Promise<KeyCount[]>;
    /** CMS pages observed without a safe same-site predecessor. */
    entries(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** External referrer hosts for content views. */
    topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Whether a bounded referrer bucket overflowed in the selected range. */
    referrerSaturated(from: Date, to: Date): Promise<boolean>;
    /** Observed same-origin transitions. */
    flows(from: Date, to: Date, limit: number): Promise<FlowCount[]>;
    /** Operational request health, separate from content-view metrics. */
    health(from: Date, to: Date): Promise<AnalyticsHealthSummary>;
    /** Safe runtime settings owned by Settings, not analytics dashboards. */
    getSettings(): Promise<AnalyticsSettings>;
    updateSettings(settings: AnalyticsSettings): Promise<AnalyticsSettings>;
    saveComplianceSnapshot(snapshot: AnalyticsComplianceSnapshot): Promise<void>;
    latestPublishedComplianceSnapshot(): Promise<AnalyticsComplianceSnapshot | null>;
}

export type AnalyticsStoreConfig = {
    policy?: Partial<AnalyticsCollectionPolicy>;
    hllStripes?: 1 | 4 | 8 | 16;
};
