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

export interface AnalyticsReports {
    summary(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<AnalyticsSummary>>;
    timeseries(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<TimeBucket[]>>;
    topPages(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    entries(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    breakdown(
        dimension: "status" | "device" | "browser" | "exclusion",
        window: AnalyticsReportWindow,
        now?: Date,
    ): Promise<AnalyticsReport<KeyCount[]>>;
    referrers(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<KeyCount[]>>;
    flows(window: AnalyticsReportWindow, limit: number, now?: Date): Promise<AnalyticsReport<FlowCount[]>>;
    health(window: AnalyticsReportWindow, now?: Date): Promise<AnalyticsReport<AnalyticsHealthSummary>>;
}
