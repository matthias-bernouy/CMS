import type { Document } from "mongodb";
import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceRow,
    EndpointPerformanceTimelinePoint,
    EndpointRequestSummary,
} from "../../../interfaces/EndpointPerformanceDashboard";
import { requestGroupFields, requestProjectionFields } from "./aggregation";

export type EndpointPerformanceSummaryRow = EndpointRequestSummary & { lastObservationAt: Date };

export function endpointPerformanceSummaryFacet(): Document[] {
    return [
        { $match: { kind: "endpoint" } },
        { $group: { _id: null, ...requestGroupFields() } },
        { $project: { _id: 0, ...requestProjectionFields(), lastObservationAt: 1 } },
    ];
}

export function endpointPerformanceTimelineFacet(range: EndpointPerformanceQuery["range"]): Document[] {
    return [
        { $match: { kind: "endpoint" } },
        {
            $group: {
                _id: { $dateTrunc: { date: "$bucket", ...timelineTruncation(range) } },
                ...requestGroupFields(),
            },
        },
        { $project: { _id: 0, bucket: "$_id", ...requestProjectionFields() } },
        { $sort: { bucket: 1 } },
    ];
}

export function endpointPerformanceRowsFacet(query: EndpointPerformanceQuery): Document[] {
    const sortField = {
        requests: "requests",
        errorRate: "errorRate",
        p50: "p50Ms",
        p95: "p95Ms",
        p99: "p99Ms",
        max: "maxMs",
    }[query.sort];
    const direction = query.order === "asc" ? 1 : -1;
    return [
        { $match: { kind: "endpoint" } },
        {
            $group: {
                _id: { surface: "$surface", endpointUrn: "$endpointUrn", method: "$method" },
                ...requestGroupFields(),
            },
        },
        {
            $project: {
                _id: 0,
                surface: "$_id.surface",
                endpointUrn: "$_id.endpointUrn",
                method: "$_id.method",
                ...requestProjectionFields(),
            },
        },
        { $sort: { [sortField]: direction, endpointUrn: 1, surface: 1, method: 1 } },
        { $limit: query.limit },
    ];
}

export function emptyEndpointPerformanceSummary(): EndpointRequestSummary {
    return { requests: 0, errors: 0, errorRate: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
}

export function endpointPerformanceTimelineBucketMs(range: EndpointPerformanceQuery["range"]): number {
    if (range === "1h") {
        return 300_000;
    }
    return range === "24h" ? 900_000 : 3_600_000;
}

export type EndpointPerformanceOverviewSnapshot = {
    summary: EndpointPerformanceSummaryRow[];
    timeline: EndpointPerformanceTimelinePoint[];
    endpoints: EndpointPerformanceRow[];
};

function timelineTruncation(range: EndpointPerformanceQuery["range"]) {
    const bucketMs = endpointPerformanceTimelineBucketMs(range);
    return bucketMs < 3_600_000
        ? { unit: "minute", binSize: bucketMs / 60_000 }
        : { unit: "hour", binSize: bucketMs / 3_600_000 };
}
