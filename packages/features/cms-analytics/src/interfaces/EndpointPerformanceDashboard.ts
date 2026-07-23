import type {
    EndpointCounterStage,
    EndpointPerformanceMethod,
    EndpointPerformanceQuery,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointTimingStage,
} from "./EndpointPerformance";

export type EndpointLatencySummary = {
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    maxMs: number | null;
};

export type EndpointRequestSummary = EndpointLatencySummary & {
    requests: number;
    errors: number;
    errorRate: number | null;
};

export type EndpointPerformanceTimelinePoint = EndpointRequestSummary & {
    bucket: Date;
};

export type EndpointPerformanceRow = EndpointRequestSummary & {
    surface: EndpointPerformanceSurface;
    endpointUrn: string;
    method: EndpointPerformanceMethod;
};

export type EndpointPerformanceHistogramBucket = {
    upperBoundMs: number | null;
    count: number;
};

export type EndpointPerformanceStageSummary = EndpointLatencySummary & {
    kind: "duration";
    unit: "ms";
    stage: EndpointTimingStage;
    observations: number;
    coverage: number;
    avgMs: number | null;
};

export type EndpointPerformanceCounterSummary = {
    kind: "counter";
    unit: "count";
    stage: EndpointCounterStage;
    observations: number;
    coverage: number;
    total: number;
    avg: number | null;
    max: number | null;
};

export type EndpointPerformanceDetail = {
    endpointUrn: string;
    surface: EndpointPerformanceSurface | null;
    method: EndpointPerformanceMethod | null;
    statuses: Array<{ statusClass: EndpointPerformanceStatusClass; count: number }>;
    latencyHistogram: EndpointPerformanceHistogramBucket[];
    stages: Array<EndpointPerformanceStageSummary | EndpointPerformanceCounterSummary>;
};

export type EndpointPerformanceMetadata = {
    query: EndpointPerformanceQuery;
    generatedAt: Date;
    from: Date;
    to: Date;
    bucketMs: number;
    rollupBucketMs: number;
    histogramBoundsMs: readonly number[];
    lastObservationAt: Date | null;
    lastFlushAt: Date | null;
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    /** Collector health is process-global for the requested time range, never dimension-filtered. */
    collectorHealthScope: "global";
    /** False when an ambiguous endpoint write makes exact persisted-loss accounting impossible. */
    collectorCountsExact: boolean;
    partial: boolean;
    stale: boolean;
};

export type EndpointPerformanceDashboard = {
    summary: EndpointRequestSummary;
    timeline: EndpointPerformanceTimelinePoint[];
    endpoints: EndpointPerformanceRow[];
    detail: EndpointPerformanceDetail | null;
    meta: EndpointPerformanceMetadata;
};
