import type { Collection, Document } from "mongodb";
import type { EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceRow,
    EndpointPerformanceTimelinePoint,
    EndpointRequestSummary,
} from "../../../interfaces/EndpointPerformanceDashboard";
import { requestGroupFields, requestProjectionFields } from "./aggregation";
import type { EndpointPerformanceDoc } from "./types";

type Match = Record<string, unknown>;

export async function readEndpointPerformanceSummary(
    collection: Collection<EndpointPerformanceDoc>,
    match: Match,
): Promise<EndpointRequestSummary & { lastObservationAt: Date | null }> {
    const rows = await collection
        .aggregate<EndpointRequestSummary & { lastObservationAt: Date }>([
            { $match: match },
            { $group: { _id: null, ...requestGroupFields() } },
            { $project: { _id: 0, ...requestProjectionFields(), lastObservationAt: 1 } },
        ])
        .toArray();
    return rows[0] ?? { ...emptyRequestSummary(), lastObservationAt: null };
}

export async function readEndpointPerformanceTimeline(
    collection: Collection<EndpointPerformanceDoc>,
    match: Match,
    range: EndpointPerformanceQuery["range"],
): Promise<EndpointPerformanceTimelinePoint[]> {
    const truncation = timelineTruncation(range);
    return collection
        .aggregate<EndpointPerformanceTimelinePoint>([
            { $match: match },
            {
                $group: {
                    _id: { $dateTrunc: { date: "$bucket", ...truncation } },
                    ...requestGroupFields(),
                },
            },
            { $project: { _id: 0, bucket: "$_id", ...requestProjectionFields() } },
            { $sort: { bucket: 1 } },
        ])
        .toArray();
}

export async function readEndpointPerformanceRows(
    collection: Collection<EndpointPerformanceDoc>,
    match: Match,
    query: EndpointPerformanceQuery,
): Promise<EndpointPerformanceRow[]> {
    const sortField = {
        requests: "requests",
        errorRate: "errorRate",
        p50: "p50Ms",
        p95: "p95Ms",
        p99: "p99Ms",
        max: "maxMs",
    }[query.sort];
    const direction = query.order === "asc" ? 1 : -1;
    return collection
        .aggregate<EndpointPerformanceRow>([
            { $match: match },
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
        ] as Document[])
        .toArray();
}

function emptyRequestSummary(): EndpointRequestSummary {
    return { requests: 0, errors: 0, errorRate: null, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null };
}

function timelineTruncation(range: EndpointPerformanceQuery["range"]) {
    if (range === "1h") {
        return { unit: "minute", binSize: 5 } as const;
    }
    if (range === "24h") {
        return { unit: "minute", binSize: 15 } as const;
    }
    return { unit: "hour", binSize: 1 } as const;
}
