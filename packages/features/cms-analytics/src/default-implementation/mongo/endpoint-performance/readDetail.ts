import type { Document } from "mongodb";
import {
    ENDPOINT_COUNTER_STAGES,
    ENDPOINT_TIMING_STAGES,
    type EndpointCounterStage,
    type EndpointPerformanceQuery,
} from "../../../interfaces/EndpointPerformance";
import type {
    EndpointPerformanceCounterSummary,
    EndpointPerformanceDetail,
    EndpointPerformanceStageSummary,
} from "../../../interfaces/EndpointPerformanceDashboard";
import { latencyFromRaw, latencyGroupFields, rawHistogramBuckets } from "./aggregation";

type StatusRow = { _id: EndpointPerformanceDetail["statuses"][number]["statusClass"]; count: number };

export type EndpointPerformanceDetailSnapshot = {
    detailStages?: Array<Record<string, unknown>>;
    detailStatuses?: StatusRow[];
};

export function endpointPerformanceDetailFacets(query: EndpointPerformanceQuery): Record<string, Document[]> {
    if (!query.endpointUrn) {
        return {};
    }
    const group: Record<string, unknown> = { _id: null, requests: { $sum: "$requestCount" } };
    for (const stage of ENDPOINT_TIMING_STAGES) {
        Object.assign(group, latencyGroupFields(stage, stage));
    }
    for (const counter of ENDPOINT_COUNTER_STAGES) {
        Object.assign(group, counterGroupFields(counter));
    }
    return {
        detailStages: [{ $match: { kind: "endpoint" } }, { $group: group }],
        detailStatuses: [
            { $match: { kind: "endpoint" } },
            { $group: { _id: "$statusClass", count: { $sum: "$requestCount" } } },
            { $sort: { _id: 1 } },
        ],
    };
}

export function endpointPerformanceDetailFromSnapshot(
    snapshot: EndpointPerformanceDetailSnapshot,
    query: EndpointPerformanceQuery,
): EndpointPerformanceDetail | null {
    const row = snapshot.detailStages?.[0];
    if (!query.endpointUrn || !row) {
        return null;
    }
    const requests = numberValue(row.requests);
    const durations = ENDPOINT_TIMING_STAGES.map((stage) => durationSummary(row, stage, requests)).filter(
        (stage): stage is EndpointPerformanceStageSummary => stage !== null,
    );
    const counters = ENDPOINT_COUNTER_STAGES.map((stage) => counterSummary(row, stage, requests)).filter(
        (stage): stage is EndpointPerformanceCounterSummary => stage !== null,
    );
    return {
        endpointUrn: query.endpointUrn,
        surface: query.surface ?? null,
        method: query.method ?? null,
        statuses: (snapshot.detailStatuses ?? []).map(({ _id, count }) => ({ statusClass: _id, count })),
        latencyHistogram: rawHistogramBuckets(row, "cms_total"),
        stages: [...durations, ...counters],
    };
}

function durationSummary(
    row: Record<string, unknown>,
    stage: (typeof ENDPOINT_TIMING_STAGES)[number],
    requests: number,
): EndpointPerformanceStageSummary | null {
    const observations = numberValue(row[`${stage}Count`]);
    return observations === 0
        ? null
        : {
              kind: "duration",
              unit: "ms",
              stage,
              observations,
              coverage: requests > 0 ? observations / requests : 0,
              avgMs: numberValue(row[`${stage}SumMs`]) / observations,
              ...latencyFromRaw(row, stage),
          };
}

function counterSummary(
    row: Record<string, unknown>,
    stage: EndpointCounterStage,
    requests: number,
): EndpointPerformanceCounterSummary | null {
    const observations = numberValue(row[`${stage}Observations`]);
    const total = numberValue(row[`${stage}Sum`]);
    return observations === 0
        ? null
        : {
              kind: "counter",
              unit: "count",
              stage,
              observations,
              coverage: requests > 0 ? observations / requests : 0,
              total,
              avg: total / observations,
              max: nullableNumber(row[`${stage}Max`]),
          };
}

function counterGroupFields(stage: EndpointCounterStage): Record<string, unknown> {
    return {
        [`${stage}Observations`]: { $sum: { $ifNull: [`$counters.${stage}.observations`, 0] } },
        [`${stage}Sum`]: { $sum: { $ifNull: [`$counters.${stage}.sum`, 0] } },
        [`${stage}Max`]: { $max: `$counters.${stage}.max` },
    };
}

function numberValue(value: unknown): number {
    return nullableNumber(value) ?? 0;
}

function nullableNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}
