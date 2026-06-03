/**
 * The AnalyticsStore contract: one writer used by delivery and a small set of read
 * methods backing the control dashboards. Reads return pre-aggregated shapes
 * (counters/buckets), never raw events — see §5 of ANALYTICS_PLAN.md.
 */

import type { AnalyticsEvent } from "./AnalyticsEvent";

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

/** Headline numbers for the dashboard cards over a period. */
export type AnalyticsSummary = {
    views: number;
    uniqueVisitors: number;
    avgMs: number;
    errorRate: number;      // (4xx + 5xx) / total
};

/** A time-range query plus the bucketing granularity for the series. */
export type RangeQuery = {
    from: Date;
    to: Date;
    interval: 'hour' | 'day';
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
    /** Most-viewed paths over [from, to), capped at `limit`. */
    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]>;
    /** Counts grouped by a dimension over [from, to). */
    breakdown(dim: 'status' | 'device' | 'browser', from: Date, to: Date): Promise<KeyCount[]>;
}
