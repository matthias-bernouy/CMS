import {
    ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS,
    endpointPerformanceBinField,
    endpointPerformanceHistogramBuckets,
    endpointPerformancePercentile,
} from "../../../core/rollups/endpoint-performance/histogram";
import type { EndpointLatencySummary } from "../../../interfaces/EndpointPerformanceDashboard";

const BIN_COUNT = ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS.length + 1;

export function requestGroupFields() {
    return {
        requests: { $sum: "$requestCount" },
        errors: { $sum: "$errorCount" },
        firstObservationAt: { $min: "$firstObservedAt" },
        lastObservationAt: { $max: "$lastObservedAt" },
        ...latencyGroupFields("latency", "cms_total"),
    };
}

export function requestProjectionFields() {
    return {
        requests: 1,
        errors: 1,
        errorRate: { $cond: [{ $gt: ["$requests", 0] }, { $divide: ["$errors", "$requests"] }, null] },
        p50Ms: percentileExpression("latency", 0.5),
        p95Ms: percentileExpression("latency", 0.95),
        p99Ms: percentileExpression("latency", 0.99),
        maxMs: { $ifNull: ["$latencyMaxMs", null] },
    };
}

export function latencyGroupFields(prefix: string, stage: string): Record<string, unknown> {
    const fields: Record<string, unknown> = {
        [`${prefix}Count`]: { $sum: { $ifNull: [`$stages.${stage}.count`, 0] } },
        [`${prefix}SumMs`]: { $sum: { $ifNull: [`$stages.${stage}.sumMs`, 0] } },
        [`${prefix}MaxMs`]: { $max: `$stages.${stage}.maxMs` },
    };
    for (let index = 0; index < BIN_COUNT; index++) {
        fields[`${prefix}Bin${index}`] = {
            $sum: { $ifNull: [`$stages.${stage}.bins.${endpointPerformanceBinField(index)}`, 0] },
        };
    }
    return fields;
}

export function latencyFromRaw(row: Record<string, unknown>, prefix: string): EndpointLatencySummary {
    const histogram = rawHistogram(row, prefix);
    const maxMs = finiteNumber(row[`${prefix}MaxMs`]);
    return {
        p50Ms: endpointPerformancePercentile(histogram, 0.5, maxMs),
        p95Ms: endpointPerformancePercentile(histogram, 0.95, maxMs),
        p99Ms: endpointPerformancePercentile(histogram, 0.99, maxMs),
        maxMs,
    };
}

export function rawHistogram(row: Record<string, unknown>, prefix: string): number[] {
    return Array.from({ length: BIN_COUNT }, (_, index) => finiteNumber(row[`${prefix}Bin${index}`]) ?? 0);
}

export function rawHistogramBuckets(row: Record<string, unknown>, prefix: string) {
    return endpointPerformanceHistogramBuckets(rawHistogram(row, prefix));
}

function percentileExpression(prefix: string, percentile: number): Record<string, unknown> {
    const bins = Array.from({ length: BIN_COUNT }, (_, index) => `$${prefix}Bin${index}`);
    const total = { $add: bins };
    const rank = { $ceil: { $multiply: [total, percentile] } };
    const cumulative: string[] = [];
    const branches = bins.map((bin, index) => {
        cumulative.push(bin);
        return {
            case: { $lte: [rank, cumulative.length === 1 ? bin : { $add: [...cumulative] }] },
            then: percentileUpperBound(prefix, index),
        };
    });
    return {
        $cond: [{ $eq: [total, 0] }, null, { $switch: { branches, default: { $ifNull: [`$${prefix}MaxMs`, null] } } }],
    };
}

function percentileUpperBound(prefix: string, index: number): unknown {
    const upperBound = ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS[index];
    return upperBound === undefined ? `$${prefix}MaxMs` : { $min: [upperBound, `$${prefix}MaxMs`] };
}

function finiteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
