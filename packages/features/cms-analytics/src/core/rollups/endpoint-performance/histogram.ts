import type { EndpointPerformanceHistogramBucket } from "../../../interfaces/EndpointPerformanceDashboard";

export const ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS = [
    5, 10, 25, 50, 75, 100, 150, 200, 300, 500, 750, 1_000, 1_500, 2_000, 3_000, 5_000, 10_000, 30_000, 120_000,
] as const;

export type FixedHistogram = number[];

export function emptyEndpointPerformanceHistogram(): FixedHistogram {
    return Array.from({ length: ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS.length + 1 }, () => 0);
}

export function addEndpointPerformanceDuration(histogram: FixedHistogram, durationMs: number, count = 1): void {
    const index = endpointPerformanceBinIndex(durationMs);
    histogram[index] = (histogram[index] ?? 0) + count;
}

export function mergeEndpointPerformanceHistogram(target: FixedHistogram, source: readonly number[]): void {
    for (let index = 0; index < target.length; index++) {
        target[index] = (target[index] ?? 0) + (source[index] ?? 0);
    }
}

export function endpointPerformancePercentile(
    histogram: readonly number[],
    percentile: number,
    maxMs: number | null,
): number | null {
    const total = histogram.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (total === 0 || percentile <= 0 || percentile > 1) {
        return null;
    }
    const rank = Math.ceil(total * percentile);
    let cumulative = 0;
    for (let index = 0; index < histogram.length; index++) {
        cumulative += Math.max(0, histogram[index] ?? 0);
        if (cumulative >= rank) {
            return ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS[index] ?? maxMs;
        }
    }
    return maxMs;
}

export function endpointPerformanceHistogramBuckets(
    histogram: readonly number[],
): EndpointPerformanceHistogramBucket[] {
    return histogram.map((count, index) => ({
        upperBoundMs: ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS[index] ?? null,
        count: Math.max(0, count),
    }));
}

export function endpointPerformanceBinField(index: number): string {
    return `b${index}`;
}

function endpointPerformanceBinIndex(durationMs: number): number {
    const index = ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS.findIndex((bound) => durationMs <= bound);
    return index === -1 ? ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS.length : index;
}
