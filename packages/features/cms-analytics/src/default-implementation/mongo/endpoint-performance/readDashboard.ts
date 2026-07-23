import type { Collection, Document } from "mongodb";
import { ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS } from "../../../core/rollups/endpoint-performance/histogram";
import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    truncateEndpointPerformanceBucket,
} from "../../../core/rollups/endpoint-performance/normalization";
import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type { EndpointPerformanceDashboard } from "../../../interfaces/EndpointPerformanceDashboard";
import {
    endpointPerformanceDetailFacets,
    endpointPerformanceDetailFromSnapshot,
    type EndpointPerformanceDetailSnapshot,
} from "./readDetail";
import {
    emptyEndpointPerformanceSummary,
    endpointPerformanceRowsFacet,
    endpointPerformanceSummaryFacet,
    endpointPerformanceTimelineBucketMs,
    endpointPerformanceTimelineFacet,
    type EndpointPerformanceOverviewSnapshot,
} from "./readOverview";
import { ENDPOINT_PERFORMANCE_ROLLUP_VERSION, type EndpointPerformanceDoc } from "./types";

const RANGE_MS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 } as const;

type CollectorHealth = {
    accepted: number;
    dropped: number;
    invalid: number;
    flushFailures: number;
    lastFlushAt: Date | null;
    uncertain: number;
};

type DashboardSnapshot = EndpointPerformanceOverviewSnapshot &
    EndpointPerformanceDetailSnapshot & { health: CollectorHealth[] };

export async function readEndpointPerformanceDashboard(
    collection: Collection<EndpointPerformanceDoc>,
    query: EndpointPerformanceQuery,
    now: Date,
): Promise<EndpointPerformanceDashboard> {
    const from = truncateEndpointPerformanceBucket(new Date(now.getTime() - RANGE_MS[query.range]));
    const rows = await collection
        .aggregate<DashboardSnapshot>([
            { $match: dashboardMatch(query, from, now) },
            {
                $facet: {
                    summary: endpointPerformanceSummaryFacet(),
                    timeline: endpointPerformanceTimelineFacet(query.range),
                    endpoints: endpointPerformanceRowsFacet(query),
                    health: collectorHealthFacet(),
                    ...endpointPerformanceDetailFacets(query),
                },
            },
        ])
        .toArray();
    const snapshot = { ...emptySnapshot(), ...(rows[0] ?? {}) };
    const summary = snapshot.summary[0] ?? { ...emptyEndpointPerformanceSummary(), lastObservationAt: null };
    const health = snapshot.health[0] ?? emptyCollectorHealth();
    const { lastObservationAt, ...publicSummary } = summary;
    const uncertain = health.uncertain > 0;
    return {
        summary: publicSummary,
        timeline: snapshot.timeline,
        endpoints: snapshot.endpoints,
        detail: endpointPerformanceDetailFromSnapshot(snapshot, query),
        meta: {
            query,
            generatedAt: now,
            from,
            to: now,
            bucketMs: endpointPerformanceTimelineBucketMs(query.range),
            rollupBucketMs: ENDPOINT_PERFORMANCE_BUCKET_MS,
            histogramBoundsMs: ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS,
            lastObservationAt,
            lastFlushAt: health.lastFlushAt,
            accepted: health.accepted,
            dropped: health.dropped,
            invalid: health.invalid,
            flushFailures: health.flushFailures,
            collectorHealthScope: "global",
            collectorCountsExact: !uncertain,
            partial: health.dropped > 0 || health.invalid > 0 || health.flushFailures > 0 || uncertain,
            stale:
                health.lastFlushAt === null ||
                now.getTime() - health.lastFlushAt.getTime() > ENDPOINT_PERFORMANCE_BUCKET_MS * 2 ||
                (lastObservationAt !== null &&
                    now.getTime() - lastObservationAt.getTime() > ENDPOINT_PERFORMANCE_BUCKET_MS * 2),
        },
    };
}

function dashboardMatch(query: EndpointPerformanceQuery, from: Date, to: Date): Document {
    const dimensions = {
        ...(query.surface ? { surface: query.surface } : {}),
        ...(query.endpointUrn ? { endpointUrn: query.endpointUrn } : {}),
        ...(query.method ? { method: query.method } : {}),
        ...(query.statusClass ? { statusClass: query.statusClass } : {}),
    };
    return {
        rollupVersion: ENDPOINT_PERFORMANCE_ROLLUP_VERSION,
        bucket: { $gte: from, $lt: to },
        $or: [{ kind: "collector" }, { kind: "endpoint", ...dimensions }],
    };
}

function collectorHealthFacet(): Document[] {
    return [
        { $match: { kind: "collector" } },
        {
            $group: {
                _id: null,
                accepted: { $sum: "$accepted" },
                dropped: { $sum: "$dropped" },
                invalid: { $sum: "$invalid" },
                flushFailures: { $sum: "$flushFailures" },
                lastFlushAt: { $max: "$lastFlushAt" },
                uncertain: { $max: { $cond: [{ $eq: ["$uncertain", true] }, 1, 0] } },
            },
        },
        { $project: { _id: 0 } },
    ];
}

function emptySnapshot(): DashboardSnapshot {
    return { summary: [], timeline: [], endpoints: [], health: [] };
}

function emptyCollectorHealth(): CollectorHealth {
    return { accepted: 0, dropped: 0, invalid: 0, flushFailures: 0, lastFlushAt: null, uncertain: 0 };
}
