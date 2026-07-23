import type {
    EndpointPerformanceMethod,
    EndpointPerformanceOutcome,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointTimingStage,
} from "../../../interfaces/EndpointPerformance";

export type EndpointPerformanceStageDoc = {
    count: number;
    sumMs: number;
    maxMs: number;
    bins: Record<string, number>;
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
    expiresAt: Date;
    rollupVersion: string;
};

export type EndpointPerformanceCollectorDoc = {
    _id: string;
    kind: "collector";
    bucket: Date;
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    lastFlushAt: Date;
    expiresAt: Date;
    rollupVersion: string;
};

export type EndpointPerformanceDoc = EndpointPerformanceRollupDoc | EndpointPerformanceCollectorDoc;
