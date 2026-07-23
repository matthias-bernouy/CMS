import type { Collection } from "mongodb";
import type { AnalyticsHealthSummary, AnalyticsSummary } from "../../interfaces/AnalyticsStore";
import { dayBucketCount } from "../../core/buckets";
import type { RollupDoc } from "./types";

export async function readSummary(rollups: Collection<RollupDoc>, from: Date, to: Date): Promise<AnalyticsSummary> {
    const range = { bucket: { $gte: from, $lt: to } };
    const [pv, uv, health] = await Promise.all([
        aggregateTotals(rollups, { metric: "pv", dim: "all", ...range }),
        aggregateTotals(rollups, { metric: "uv", dim: "all", ...range }),
        readHealth(rollups, from, to),
    ]);
    const views = pv.count;
    return {
        views,
        uniqueVisitors: uv.count,
        visitorDays: uv.count,
        averageDailyVisitors: average(uv.count, dayBucketCount(from, to)),
        avgMs: views ? Math.round(pv.msSum / views) : 0,
        errorRate: health.requests ? (health.clientErrors + health.serverErrors) / health.requests : 0,
    };
}

export async function readHealth(
    rollups: Collection<RollupDoc>,
    from: Date,
    to: Date,
): Promise<AnalyticsHealthSummary> {
    const range = { bucket: { $gte: from, $lt: to } };
    const [request, outcomes] = await Promise.all([
        aggregateTotals(rollups, { metric: "request", dim: "all", ...range }),
        rollups
            .aggregate<{ _id: string; count: number }>([
                { $match: { metric: "request", dim: "outcome", ...range } },
                { $group: { _id: "$key", count: { $sum: "$count" } } },
            ])
            .toArray(),
    ]);
    const count = new Map(outcomes.map((row) => [row._id, row.count]));
    const notFound = count.get("not_found") ?? 0;
    return {
        requests: request.count,
        notFound,
        clientErrors: notFound + (count.get("client_error") ?? 0),
        serverErrors: count.get("server_error") ?? 0,
        avgMs: request.count ? Math.round(request.msSum / request.count) : 0,
        maxMs: request.maxMs,
    };
}

async function aggregateTotals(
    rollups: Collection<RollupDoc>,
    match: Record<string, unknown>,
): Promise<{ count: number; msSum: number; maxMs: number }> {
    const [row] = await rollups
        .aggregate<{ count: number; msSum: number; maxMs: number }>([
            { $match: match },
            {
                $group: {
                    _id: null,
                    count: { $sum: "$count" },
                    msSum: { $sum: "$msSum" },
                    maxMs: { $max: "$msMax" },
                },
            },
        ])
        .toArray();
    return {
        count: row?.count ?? 0,
        msSum: row?.msSum ?? 0,
        maxMs: row?.maxMs ?? 0,
    };
}

function average(total: number, count: number): number {
    return count ? Math.round((total / count) * 100) / 100 : 0;
}
