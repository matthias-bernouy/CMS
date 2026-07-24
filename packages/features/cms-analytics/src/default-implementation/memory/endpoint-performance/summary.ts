import {
    emptyEndpointPerformanceHistogram,
    endpointPerformancePercentile,
    mergeEndpointPerformanceHistogram,
} from "../../../core/rollups/endpoint-performance/histogram";
import type { EndpointPerformanceAggregate } from "../../../core/rollups/endpoint-performance/types";
import type { EndpointRequestSummary } from "../../../interfaces/EndpointPerformanceDashboard";

export type RequestSummaryAccumulator = {
    requests: number;
    errors: number;
    histogram: number[];
    maxMs: number | null;
    lastObservationAt: Date | null;
};

export function createRequestSummaryAccumulator(): RequestSummaryAccumulator {
    return {
        requests: 0,
        errors: 0,
        histogram: emptyEndpointPerformanceHistogram(),
        maxMs: null,
        lastObservationAt: null,
    };
}

export function addRequestAggregate(target: RequestSummaryAccumulator, aggregate: EndpointPerformanceAggregate): void {
    target.requests += aggregate.requestCount;
    target.errors += aggregate.errorCount;
    target.lastObservationAt = latest(target.lastObservationAt, aggregate.lastObservedAt);
    const total = aggregate.stages.cms_total;
    if (!total) {
        return;
    }
    mergeEndpointPerformanceHistogram(target.histogram, total.histogram);
    target.maxMs = target.maxMs === null ? total.maxMs : Math.max(target.maxMs, total.maxMs);
}

export function requestSummary(target: RequestSummaryAccumulator): EndpointRequestSummary {
    return {
        requests: target.requests,
        errors: target.errors,
        errorRate: target.requests > 0 ? target.errors / target.requests : null,
        p50Ms: endpointPerformancePercentile(target.histogram, 0.5, target.maxMs),
        p95Ms: endpointPerformancePercentile(target.histogram, 0.95, target.maxMs),
        p99Ms: endpointPerformancePercentile(target.histogram, 0.99, target.maxMs),
        maxMs: target.maxMs,
    };
}

function latest(current: Date | null, candidate: Date): Date {
    return current === null || candidate > current ? new Date(candidate) : current;
}
