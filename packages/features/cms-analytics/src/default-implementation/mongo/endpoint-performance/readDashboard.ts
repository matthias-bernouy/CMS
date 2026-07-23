import type { Collection } from "mongodb";
import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type { EndpointPerformanceDashboard } from "../../../interfaces/EndpointPerformanceDashboard";
import {
    ENDPOINT_PERFORMANCE_BUCKET_MS,
    truncateEndpointPerformanceBucket,
} from "../../../core/rollups/endpoint-performance/normalization";
import { readEndpointPerformanceDetail } from "./readDetail";
import {
    readEndpointPerformanceRows,
    readEndpointPerformanceSummary,
    readEndpointPerformanceTimeline,
} from "./readOverview";
import type { EndpointPerformanceDoc } from "./types";
import { ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS } from "../../../core/rollups/endpoint-performance/histogram";

const RANGE_MS = { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000 } as const;

export async function readEndpointPerformanceDashboard(
    collection: Collection<EndpointPerformanceDoc>,
    query: EndpointPerformanceQuery,
    now: Date,
): Promise<EndpointPerformanceDashboard> {
    const from = truncateEndpointPerformanceBucket(new Date(now.getTime() - RANGE_MS[query.range]));
    const match = endpointMatch(query, from, now);
    const [summary, timeline, endpoints, detail, health] = await Promise.all([
        readEndpointPerformanceSummary(collection, match),
        readEndpointPerformanceTimeline(collection, match, query.range),
        readEndpointPerformanceRows(collection, match, query),
        readEndpointPerformanceDetail(collection, match, query),
        readCollectorHealth(collection, from, now),
    ]);
    const lastObservationAt = summary.lastObservationAt;
    const { lastObservationAt: _lastObservationAt, ...publicSummary } = summary;
    return {
        summary: publicSummary,
        timeline,
        endpoints,
        detail,
        meta: {
            query,
            generatedAt: now,
            from,
            to: now,
            bucketMs: ENDPOINT_PERFORMANCE_BUCKET_MS,
            histogramBoundsMs: ENDPOINT_PERFORMANCE_HISTOGRAM_BOUNDS_MS,
            lastObservationAt,
            lastFlushAt: health.lastFlushAt,
            accepted: health.accepted,
            dropped: health.dropped,
            invalid: health.invalid,
            flushFailures: health.flushFailures,
            partial: health.dropped > 0 || health.invalid > 0 || health.flushFailures > 0,
            stale:
                lastObservationAt !== null &&
                now.getTime() - lastObservationAt.getTime() > ENDPOINT_PERFORMANCE_BUCKET_MS * 2,
        },
    };
}

function endpointMatch(query: EndpointPerformanceQuery, from: Date, to: Date): Record<string, unknown> {
    return {
        kind: "endpoint",
        bucket: { $gte: from, $lt: to },
        ...(query.surface ? { surface: query.surface } : {}),
        ...(query.endpointUrn ? { endpointUrn: query.endpointUrn } : {}),
        ...(query.method ? { method: query.method } : {}),
        ...(query.statusClass ? { statusClass: query.statusClass } : {}),
    };
}

async function readCollectorHealth(collection: Collection<EndpointPerformanceDoc>, from: Date, to: Date) {
    const rows = await collection
        .aggregate<{
            accepted: number;
            dropped: number;
            invalid: number;
            flushFailures: number;
            lastFlushAt: Date | null;
        }>([
            { $match: { kind: "collector", bucket: { $gte: from, $lt: to } } },
            {
                $group: {
                    _id: null,
                    accepted: { $sum: "$accepted" },
                    dropped: { $sum: "$dropped" },
                    invalid: { $sum: "$invalid" },
                    flushFailures: { $sum: "$flushFailures" },
                    lastFlushAt: { $max: "$lastFlushAt" },
                },
            },
            { $project: { _id: 0 } },
        ])
        .toArray();
    return (
        rows[0] ?? {
            accepted: 0,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            lastFlushAt: null,
        }
    );
}
