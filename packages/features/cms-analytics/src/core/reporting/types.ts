import type {
    AnalyticsHealthSummary,
    AnalyticsSummary,
    FlowCount,
    KeyCount,
    TimeBucket,
} from "../../interfaces/AnalyticsStore";

export type AnalyticsReportWindow = "24h" | "7d" | "30d";

export type AnalyticsReportMetadata = {
    profile: "privacy-strict";
    window: AnalyticsReportWindow;
    from: Date;
    to: Date;
    lastClosedBucket: Date;
    threshold: number;
    rounding: number;
    suppressedValueCount: number;
    referrerSaturated: boolean;
    versions: {
        filter: string;
        rollup: string;
        visitorEstimator: string;
        publication: string;
    };
};

export type AnalyticsReport<T> = {
    data: T;
    meta: AnalyticsReportMetadata;
};

export type AnalyticsReportSummary = AnalyticsSummary & {
    /** HLL++ estimate for the last fully completed UTC calendar day. */
    latestCompletedDayVisitors: number;
    latestCompletedUtcDay: Date;
};

export interface AnalyticsReports {
    summary(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<AnalyticsReportSummary>>;
    timeseries(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<TimeBucket[]>>;
    topPages(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    entries(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    breakdown(
        dimension: "status" | "device" | "browser" | "exclusion" | "latency",
        window: AnalyticsReportWindow,
        now?: Date,
    ): Promise<AnalyticsReport<KeyCount[]>>;
    referrers(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    flows(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<FlowCount[]>>;
    health(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<AnalyticsHealthSummary>>;
}
