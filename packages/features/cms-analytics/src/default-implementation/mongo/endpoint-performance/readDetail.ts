import type { Collection } from "mongodb";
import { ENDPOINT_TIMING_STAGES, type EndpointPerformanceQuery } from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceDetail,
    EndpointPerformanceStageSummary,
} from "../../../interfaces/EndpointPerformanceDashboard";
import { latencyFromRaw, latencyGroupFields, rawHistogramBuckets } from "./aggregation";
import type { EndpointPerformanceDoc } from "./types";

export async function readEndpointPerformanceDetail(
    collection: Collection<EndpointPerformanceDoc>,
    match: Record<string, unknown>,
    query: EndpointPerformanceQuery,
): Promise<EndpointPerformanceDetail | null> {
    if (!query.endpointUrn) {
        return null;
    }
    const group: Record<string, unknown> = { _id: null, requests: { $sum: "$requestCount" } };
    for (const stage of ENDPOINT_TIMING_STAGES) {
        Object.assign(group, latencyGroupFields(stage, stage));
    }
    const [stageRows, statuses] = await Promise.all([
        collection.aggregate<Record<string, unknown>>([{ $match: match }, { $group: group }]).toArray(),
        collection
            .aggregate<{ _id: EndpointPerformanceDetail["statuses"][number]["statusClass"]; count: number }>([
                { $match: match },
                { $group: { _id: "$statusClass", count: { $sum: "$requestCount" } } },
                { $sort: { _id: 1 } },
            ])
            .toArray(),
    ]);
    const row = stageRows[0];
    if (!row) {
        return null;
    }
    const requests = numberValue(row.requests);
    return {
        endpointUrn: query.endpointUrn,
        surface: query.surface ?? null,
        method: query.method ?? null,
        statuses: statuses.map(({ _id, count }) => ({ statusClass: _id, count })),
        latencyHistogram: rawHistogramBuckets(row, "cms_total"),
        stages: ENDPOINT_TIMING_STAGES.map((stage) => stageSummary(row, stage, requests)).filter(
            (stage): stage is EndpointPerformanceStageSummary => stage !== null,
        ),
    };
}

function stageSummary(
    row: Record<string, unknown>,
    stage: (typeof ENDPOINT_TIMING_STAGES)[number],
    requests: number,
): EndpointPerformanceStageSummary | null {
    const observations = numberValue(row[`${stage}Count`]);
    if (observations === 0) {
        return null;
    }
    return {
        stage,
        observations,
        coverage: requests > 0 ? observations / requests : 0,
        avgMs: numberValue(row[`${stage}SumMs`]) / observations,
        ...latencyFromRaw(row, stage),
    };
}

function numberValue(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
