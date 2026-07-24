import {
    emptyEndpointPerformanceHistogram,
    endpointPerformanceHistogramBuckets,
    endpointPerformancePercentile,
    mergeEndpointPerformanceHistogram,
} from "../../../core/rollups/endpoint-performance/histogram";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceCounterAggregate,
    EndpointPerformanceStageAggregate,
} from "../../../core/rollups/endpoint-performance/types";
import {
    ENDPOINT_COUNTER_STAGES,
    ENDPOINT_PERFORMANCE_STATUS_CLASSES,
    ENDPOINT_TIMING_STAGES,
    type EndpointPerformanceQuery,
} from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceCounterSummary,
    EndpointPerformanceDetail,
    EndpointPerformanceStageSummary,
} from "../../../interfaces/EndpointPerformanceDashboard";

export function endpointPerformanceDetail(
    rows: readonly EndpointPerformanceAggregate[],
    query: EndpointPerformanceQuery,
): EndpointPerformanceDetail | null {
    if (!query.endpointUrn || rows.length === 0) {
        return null;
    }
    const requests = rows.reduce((sum, row) => sum + row.requestCount, 0);
    const statuses = new Map<string, number>();
    const stages = new Map<string, EndpointPerformanceStageAggregate>();
    const counters = new Map<string, EndpointPerformanceCounterAggregate>();
    for (const row of rows) {
        statuses.set(row.statusClass, (statuses.get(row.statusClass) ?? 0) + row.requestCount);
        mergeStages(stages, row);
        mergeCounters(counters, row);
    }
    const totalHistogram = stages.get("cms_total")?.histogram ?? emptyEndpointPerformanceHistogram();
    return {
        endpointUrn: query.endpointUrn,
        surface: query.surface ?? null,
        method: query.method ?? null,
        statuses: ENDPOINT_PERFORMANCE_STATUS_CLASSES.flatMap((statusClass) => {
            const count = statuses.get(statusClass);
            return count === undefined ? [] : [{ statusClass, count }];
        }),
        latencyHistogram: endpointPerformanceHistogramBuckets(totalHistogram),
        stages: [
            ...ENDPOINT_TIMING_STAGES.flatMap((stage) => {
                const aggregate = stages.get(stage);
                return aggregate ? [durationSummary(stage, aggregate, requests)] : [];
            }),
            ...ENDPOINT_COUNTER_STAGES.flatMap((stage) => {
                const aggregate = counters.get(stage);
                return aggregate ? [counterSummary(stage, aggregate, requests)] : [];
            }),
        ],
    };
}

function mergeStages(target: Map<string, EndpointPerformanceStageAggregate>, row: EndpointPerformanceAggregate): void {
    for (const [stage, aggregate] of Object.entries(row.stages)) {
        if (!aggregate) {
            continue;
        }
        const current = target.get(stage) ?? {
            count: 0,
            sumMs: 0,
            maxMs: 0,
            histogram: emptyEndpointPerformanceHistogram(),
        };
        current.count += aggregate.count;
        current.sumMs += aggregate.sumMs;
        current.maxMs = Math.max(current.maxMs, aggregate.maxMs);
        mergeEndpointPerformanceHistogram(current.histogram, aggregate.histogram);
        target.set(stage, current);
    }
}

function mergeCounters(
    target: Map<string, EndpointPerformanceCounterAggregate>,
    row: EndpointPerformanceAggregate,
): void {
    for (const [stage, aggregate] of Object.entries(row.counters)) {
        if (!aggregate) {
            continue;
        }
        const current = target.get(stage) ?? { observations: 0, sum: 0, max: 0 };
        current.observations += aggregate.observations;
        current.sum += aggregate.sum;
        current.max = Math.max(current.max, aggregate.max);
        target.set(stage, current);
    }
}

function durationSummary(
    stage: EndpointPerformanceStageSummary["stage"],
    aggregate: EndpointPerformanceStageAggregate,
    requests: number,
): EndpointPerformanceStageSummary {
    return {
        kind: "duration",
        unit: "ms",
        stage,
        observations: aggregate.count,
        coverage: requests > 0 ? aggregate.count / requests : 0,
        avgMs: aggregate.count > 0 ? aggregate.sumMs / aggregate.count : null,
        p50Ms: endpointPerformancePercentile(aggregate.histogram, 0.5, aggregate.maxMs),
        p95Ms: endpointPerformancePercentile(aggregate.histogram, 0.95, aggregate.maxMs),
        p99Ms: endpointPerformancePercentile(aggregate.histogram, 0.99, aggregate.maxMs),
        maxMs: aggregate.maxMs,
    };
}

function counterSummary(
    stage: EndpointPerformanceCounterSummary["stage"],
    aggregate: EndpointPerformanceCounterAggregate,
    requests: number,
): EndpointPerformanceCounterSummary {
    return {
        kind: "counter",
        unit: "count",
        stage,
        observations: aggregate.observations,
        coverage: requests > 0 ? aggregate.observations / requests : 0,
        total: aggregate.sum,
        avg: aggregate.observations > 0 ? aggregate.sum / aggregate.observations : null,
        max: aggregate.max,
    };
}
