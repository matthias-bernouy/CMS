import { describe, expect, test } from "bun:test";
import {
    ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS,
    addEndpointPerformanceDuration,
    emptyEndpointPerformanceHistogram,
    endpointPerformanceHistogramBuckets,
    endpointPerformancePercentile,
    mergeEndpointPerformanceHistogram,
} from "cms-analytics/core/rollups/endpoint-performance/histogram";

describe("endpoint performance fixed histograms", () => {
    test("places exact boundaries and overflow in disjoint buckets", () => {
        const histogram = emptyEndpointPerformanceHistogram();
        addEndpointPerformanceDuration(histogram, 5);
        addEndpointPerformanceDuration(histogram, 5.001);
        addEndpointPerformanceDuration(histogram, 120_001);

        expect(histogram[0]).toBe(1);
        expect(histogram[1]).toBe(1);
        expect(histogram.at(-1)).toBe(1);
        expect(histogram.reduce((sum, count) => sum + count, 0)).toBe(3);
    });

    test("merges bins and resolves p50, p95, p99 to conservative upper bounds", () => {
        const first = emptyEndpointPerformanceHistogram();
        const second = emptyEndpointPerformanceHistogram();
        for (let duration = 1; duration <= 100; duration++) {
            addEndpointPerformanceDuration(duration <= 50 ? first : second, duration);
        }
        mergeEndpointPerformanceHistogram(first, second);

        expect(endpointPerformancePercentile(first, 0.5, 100)).toBe(50);
        expect(endpointPerformancePercentile(first, 0.95, 100)).toBe(100);
        expect(endpointPerformancePercentile(first, 0.99, 100)).toBe(100);
    });

    test("uses the measured maximum for overflow and returns null for empty data", () => {
        const histogram = emptyEndpointPerformanceHistogram();
        expect(endpointPerformancePercentile(histogram, 0.5, null)).toBeNull();
        addEndpointPerformanceDuration(histogram, 200_000);
        expect(endpointPerformancePercentile(histogram, 0.99, 200_000)).toBe(200_000);

        const buckets = endpointPerformanceHistogramBuckets(histogram);
        expect(buckets).toHaveLength(ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS.length + 1);
        expect(buckets.at(-1)).toEqual({ upperBoundMs: null, count: 1 });
    });

    test("never reports a percentile above the exact measured maximum", () => {
        const histogram = emptyEndpointPerformanceHistogram();
        addEndpointPerformanceDuration(histogram, 180, 20);
        expect(endpointPerformancePercentile(histogram, 0.5, 180)).toBe(180);
        expect(endpointPerformancePercentile(histogram, 0.99, 180)).toBe(180);
    });
});
