import type { Collection, Document } from "mongodb";
import type { FlowCount, KeyCount, RangeQuery, TimeBucket } from "../../interfaces/AnalyticsStore";
import { fillTimeBuckets, parseFlowKey } from "../../core/rollups/buckets";
import type { RollupDoc } from "./types";

export async function readTimeseries(rollups: Collection<RollupDoc>, query: RangeQuery): Promise<TimeBucket[]> {
    const rows = await rollups
        .aggregate<{ _id: Date; count: number; msSum: number; maxMs: number }>([
            { $match: { metric: "pv", dim: "all", bucket: { $gte: query.from, $lt: query.to } } },
            {
                $group: {
                    _id: { $dateTrunc: { date: "$bucket", unit: query.interval } },
                    count: { $sum: "$count" },
                    msSum: { $sum: "$msSum" },
                    maxMs: { $max: "$msMax" },
                },
            },
            { $sort: { _id: 1 } },
        ])
        .toArray();
    return fillTimeBuckets(
        rows.map((row) => ({
            bucket: row._id,
            count: row.count,
            avgMs: row.count ? Math.round(row.msSum / row.count) : 0,
            maxMs: row.maxMs,
        })),
        query,
    );
}

export async function readTop(
    rollups: Collection<RollupDoc>,
    metric: string,
    dim: string | string[],
    from: Date,
    to: Date,
    limit: number,
): Promise<KeyCount[]> {
    const pipe: Document[] = [
        {
            $match: {
                metric,
                dim: typeof dim === "string" ? dim : { $in: dim },
                bucket: { $gte: from, $lt: to },
            },
        },
        { $group: { _id: "$key", count: { $sum: "$count" } } },
        { $sort: { count: -1 } },
    ];
    if (limit > 0) {
        pipe.push({ $limit: limit });
    }
    const rows = await rollups.aggregate<{ _id: string; count: number }>(pipe).toArray();
    return rows.map((row) => ({ key: row._id, count: row.count }));
}

export async function readFlows(
    rollups: Collection<RollupDoc>,
    from: Date,
    to: Date,
    limit: number,
): Promise<FlowCount[]> {
    const rows = await readTop(rollups, "flow", "edge", from, to, limit);
    return rows.flatMap((row) => {
        const edge = parseFlowKey(row.key);
        return edge ? [{ ...edge, count: row.count }] : [];
    });
}
