import { ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS } from "../../../core/rollups/endpoint-performance/histogram";
import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    truncateEndpointPerformanceBucket,
} from "../../../core/rollups/endpoint-performance/normalization";
import type {
    EndpointPerformanceAggregate,
    EndpointPerformanceCollectorAggregate,
} from "../../../core/rollups/endpoint-performance/types";
import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceDashboard,
    EndpointPerformanceRow,
    EndpointPerformanceTimelinePoint,
} from "../../../interfaces/EndpointPerformanceDashboard";
import { endpointPerformanceDetail } from "./detail";
import { endpointPerformanceCollectorHealth, endpointPerformanceIsStale } from "./health";
import {
    addRequestAggregate,
    createRequestSummaryAccumulator,
    requestSummary,
    type RequestSummaryAccumulator,
} from "./summary";
import { compareEndpointPerformanceRows } from "./sortRows";

const RANGE_MS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 } as const;

export function projectEndpointPerformanceDashboard(
    allRows: readonly EndpointPerformanceAggregate[],
    allCollectors: readonly EndpointPerformanceCollectorAggregate[],
    query: EndpointPerformanceQuery,
    now: Date,
): EndpointPerformanceDashboard {
    const from = truncateEndpointPerformanceBucket(new Date(now.getTime() - RANGE_MS[query.range]));
    const rows = allRows.filter((row) => matches(row, query, from, now));
    const summaryAccumulator = rows.reduce(addToSummary, createRequestSummaryAccumulator());
    const collectorHealth = endpointPerformanceCollectorHealth(allCollectors, from, now);
    const summary = requestSummary(summaryAccumulator);
    const uncertain = collectorHealth.uncertain;
    return {
        summary,
        timeline: timeline(rows, query),
        endpoints: endpointRows(rows, query),
        detail: endpointPerformanceDetail(rows, query),
        meta: {
            query,
            generatedAt: new Date(now),
            from,
            to: new Date(now),
            bucketMs: timelineBucketMs(query.range),
            rollupBucketMs: ENDPOINT_PERFORMANCE_BUCKET_MS,
            histogramBoundsMs: ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS,
            lastObservationAt: summaryAccumulator.lastObservationAt,
            lastFlushAt: collectorHealth.lastFlushAt,
            accepted: collectorHealth.accepted,
            dropped: collectorHealth.dropped,
            invalid: collectorHealth.invalid,
            flushFailures: collectorHealth.flushFailures,
            collectorHealthScope: "global",
            collectorCountsExact: !uncertain,
            partial:
                collectorHealth.dropped > 0 ||
                collectorHealth.invalid > 0 ||
                collectorHealth.flushFailures > 0 ||
                uncertain,
            stale: endpointPerformanceIsStale(now, summaryAccumulator.lastObservationAt, collectorHealth.lastFlushAt),
        },
    };
}

function timeline(
    rows: readonly EndpointPerformanceAggregate[],
    query: EndpointPerformanceQuery,
): EndpointPerformanceTimelinePoint[] {
    const bucketMs = timelineBucketMs(query.range);
    const groups = new Map<number, RequestSummaryAccumulator>();
    for (const row of rows) {
        const bucket = Math.floor(row.bucket.getTime() / bucketMs) * bucketMs;
        const aggregate = groups.get(bucket) ?? createRequestSummaryAccumulator();
        addRequestAggregate(aggregate, row);
        groups.set(bucket, aggregate);
    }
    return [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([bucket, aggregate]) => ({ bucket: new Date(bucket), ...requestSummary(aggregate) }));
}

function endpointRows(
    rows: readonly EndpointPerformanceAggregate[],
    query: EndpointPerformanceQuery,
): EndpointPerformanceRow[] {
    const groups = new Map<string, { row: EndpointPerformanceAggregate; summary: RequestSummaryAccumulator }>();
    for (const row of rows) {
        const key = JSON.stringify([row.surface, row.endpointUrn, row.method]);
        const group = groups.get(key) ?? { row, summary: createRequestSummaryAccumulator() };
        addRequestAggregate(group.summary, row);
        groups.set(key, group);
    }
    return [...groups.values()]
        .map(({ row, summary }) => ({
            surface: row.surface,
            endpointUrn: row.endpointUrn,
            method: row.method,
            ...requestSummary(summary),
        }))
        .sort((left, right) => compareEndpointPerformanceRows(left, right, query))
        .slice(0, query.limit);
}

function matches(row: EndpointPerformanceAggregate, query: EndpointPerformanceQuery, from: Date, now: Date): boolean {
    return (
        row.bucket >= from &&
        row.bucket < now &&
        (!query.surface || row.surface === query.surface) &&
        (!query.endpointUrn || row.endpointUrn === query.endpointUrn) &&
        (!query.method || row.method === query.method) &&
        (!query.statusClass || row.statusClass === query.statusClass)
    );
}

function timelineBucketMs(range: EndpointPerformanceQuery["range"]): number {
    return range === "1h" ? 300_000 : range === "24h" ? 900_000 : 3_600_000;
}

function addToSummary(
    accumulator: RequestSummaryAccumulator,
    row: EndpointPerformanceAggregate,
): RequestSummaryAccumulator {
    addRequestAggregate(accumulator, row);
    return accumulator;
}
