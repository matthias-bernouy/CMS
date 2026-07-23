import type {
    EndpointPerformanceMethod,
    EndpointPerformanceOutcome,
    EndpointPerformanceStatusClass,
    EndpointPerformanceSurface,
    EndpointTimingStage,
} from "../../../interfaces/EndpointPerformance";
import type { FixedHistogram } from "./histogram";

export type EndpointPerformanceStageAggregate = {
    count: number;
    sumMs: number;
    maxMs: number;
    histogram: FixedHistogram;
};

export type EndpointPerformanceAggregate = {
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
    stages: Partial<Record<EndpointTimingStage, EndpointPerformanceStageAggregate>>;
};

export type EndpointPerformanceCollectorAggregate = {
    bucket: Date;
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    lastFlushAt: Date;
};

export type EndpointPerformanceBatch = {
    rollups: readonly EndpointPerformanceAggregate[];
    collectors: readonly EndpointPerformanceCollectorAggregate[];
};

export interface EndpointPerformanceBatchWriter {
    write(batch: EndpointPerformanceBatch): Promise<void>;
}
