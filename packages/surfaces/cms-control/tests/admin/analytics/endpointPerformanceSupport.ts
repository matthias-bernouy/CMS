import type {
    EndpointPerformanceDetail,
    EndpointPerformanceRow,
    EndpointPerformanceTimelinePoint,
} from "@bernouy/cms-analytics";
import type { EndpointPerformanceDashboardView } from "cms-control/components/admin/Layout/EndpointPerformance/api";

type DashboardOverrides = {
    summary?: Partial<EndpointPerformanceDashboardView["summary"]>;
    timeline?: EndpointPerformanceTimelinePointView[];
    endpoints?: EndpointPerformanceRow[];
    detail?: EndpointPerformanceDetail | null;
    meta?: Partial<EndpointPerformanceDashboardView["meta"]>;
};

type EndpointPerformanceTimelinePointView = Omit<EndpointPerformanceTimelinePoint, "bucket"> & { bucket: string };

const SUMMARY = {
    requests: 120,
    errors: 6,
    errorRate: 0.05,
    p50Ms: 80,
    p95Ms: 240,
    p99Ms: 600,
    maxMs: 900,
};

export function endpointPerformanceDashboard(overrides: DashboardOverrides = {}): EndpointPerformanceDashboardView {
    const endpointUrn = "urn:commerce:list_orders";
    return {
        summary: { ...SUMMARY, ...overrides.summary },
        timeline: overrides.timeline ?? [
            { ...SUMMARY, bucket: "2026-07-23T10:00:00.000Z", requests: 50 },
            { ...SUMMARY, bucket: "2026-07-23T11:00:00.000Z", requests: 70, p95Ms: 300, errorRate: 0.1 },
        ],
        endpoints: overrides.endpoints ?? [
            {
                ...SUMMARY,
                surface: "delivery",
                endpointUrn,
                method: "GET",
            },
        ],
        detail:
            overrides.detail === undefined
                ? {
                      endpointUrn,
                      surface: "delivery",
                      method: "GET",
                      statuses: [
                          { statusClass: "2xx", count: 114 },
                          { statusClass: "5xx", count: 6 },
                      ],
                      latencyHistogram: [
                          { upperBoundMs: 100, count: 80 },
                          { upperBoundMs: 500, count: 40 },
                      ],
                      stages: [
                          {
                              kind: "duration",
                              unit: "ms",
                              stage: "cms_authorize",
                              observations: 120,
                              coverage: 1,
                              avgMs: 20,
                              p50Ms: 15,
                              p95Ms: 30,
                              p99Ms: 45,
                              maxMs: 50,
                          },
                          {
                              kind: "duration",
                              unit: "ms",
                              stage: "cms_upstream",
                              observations: 110,
                              coverage: 0.92,
                              avgMs: 140,
                              p50Ms: 100,
                              p95Ms: 220,
                              p99Ms: 500,
                              maxMs: 800,
                          },
                          {
                              kind: "counter",
                              unit: "count",
                              stage: "edge_db_calls",
                              observations: 100,
                              coverage: 0.83,
                              total: 250,
                              avg: 2.5,
                              max: 8,
                          },
                      ],
                  }
                : overrides.detail,
        meta: {
            query: { range: "24h", sort: "p95", order: "desc", limit: 50 },
            generatedAt: "2026-07-23T12:00:00.000Z",
            from: "2026-07-22T12:00:00.000Z",
            to: "2026-07-23T12:00:00.000Z",
            bucketMs: 300_000,
            rollupBucketMs: 300_000,
            histogramBoundsMs: [10, 50, 100, 500],
            lastObservationAt: "2026-07-23T11:58:00.000Z",
            lastFlushAt: "2026-07-23T11:59:00.000Z",
            accepted: 120,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            collectorHealthScope: "global",
            collectorCountsExact: true,
            partial: false,
            stale: false,
            ...overrides.meta,
        },
    };
}

export async function waitForEndpointState(
    element: HTMLElement,
    state: "loading" | "ready" | "unavailable",
    tries = 50,
): Promise<void> {
    for (let attempt = 0; attempt < tries; attempt += 1) {
        if (element.querySelector<HTMLElement>(`[data-view-state="${state}"]`)?.hidden === false) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`Timed out waiting for endpoint performance state: ${state}`);
}
