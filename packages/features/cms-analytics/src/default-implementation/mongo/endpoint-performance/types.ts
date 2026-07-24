import type {
    EndpointCounterStage,
    EndpointPerformanceMethod,
    EndpointPerformanceOutcome,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointTimingStage,
} from "../../../interfaces/EndpointPerformance";

export const ENDPOINT_PERFORMANCE_ROLLUP_VERSION = "endpoint-performance-v1";

export type EndpointPerformanceStageDoc = {
    count: number;
    sumMs: number;
    maxMs: number;
    bins: Record<string, number>;
};

export type EndpointPerformanceCounterDoc = {
    observations: number;
    sum: number;
    max: number;
};

export type EndpointPerformanceRollupDoc = {
    _id: string;
    kind: "endpoint";
    bucket: Date;
    surface: EndpointPerformanceSurface;
    endpointUrn: string;
    method: EndpointPerformanceMethod;
    statusClass: EndpointPerformanceStatusClass;
    outcome: EndpointPerformanceOutcome;
    requestCount: number;
    errorCount: number;
    firstObservedAt: Date;
    lastObservedAt: Date;
    stages: Partial<Record<EndpointTimingStage, EndpointPerformanceStageDoc>>;
    counters: Partial<Record<EndpointCounterStage, EndpointPerformanceCounterDoc>>;
    expiresAt: Date;
    rollupVersion: string;
};

export type EndpointPerformanceCollectorDoc = {
    _id: string;
    kind: "collector";
    collectorId: string;
    bucket: Date;
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    uncertain: boolean;
    lastFlushAt: Date;
    expiresAt: Date;
    rollupVersion: string;
};

export type EndpointPerformanceDoc = EndpointPerformanceRollupDoc | EndpointPerformanceCollectorDoc;
