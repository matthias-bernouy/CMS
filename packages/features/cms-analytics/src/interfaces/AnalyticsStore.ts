/**
 * The AnalyticsStore contract: one writer used by delivery and a small set of read
 * methods backing the control dashboards. Reads return pre-aggregated shapes
 * (counters/buckets), never raw events.
 */

import type { AnalyticsEvent } from "./AnalyticsEvent";
import type { AnalyticsCollectionPolicy } from "./AnalyticsPolicy";

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
    /** Sum of daily unique visitors. Kept as the legacy API field. */
    uniqueVisitors: number;
    visitorDays: number;
    averageDailyVisitors: number;
    avgMs: number;
    /** Request error rate, including non-content responses. */
    errorRate: number;
};

export type AnalyticsHealthSummary = {
    requests: number;
    notFound: number;
    clientErrors: number;
    serverErrors: number;
    avgMs: number;
    maxMs: number;
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
    /** Record one event (delivery writer). Idempotent unique-visitor dedup; meant to be called fire-and-forget. */
    record(event: AnalyticsEvent): Promise<void>;
    /** Headline numbers over [from, to). */
    summary(from: Date, to: Date): Promise<AnalyticsSummary>;
    /** Views (+ latency) per bucket over the range. */
    timeseries(q: RangeQuery): Promise<TimeBucket[]>;
    /** @deprecated Compatibility alias for `topPages`. */
    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Most-viewed stable page ids, falling back to paths for legacy producers. */
    topPages(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Counts grouped by a dimension over [from, to); status covers all non-bot requests. */
    breakdown(dim: "status" | "device" | "browser" | "acquisition", from: Date, to: Date): Promise<KeyCount[]>;
    /** External referrer hosts for content views. */
    topReferrers(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Observed same-origin transitions. */
    flows(from: Date, to: Date, limit: number): Promise<FlowCount[]>;
    /** Operational request health, separate from content-view metrics. */
    health(from: Date, to: Date): Promise<AnalyticsHealthSummary>;
}

export type AnalyticsStoreConfig = {
    policy?: Partial<AnalyticsCollectionPolicy>;
};
