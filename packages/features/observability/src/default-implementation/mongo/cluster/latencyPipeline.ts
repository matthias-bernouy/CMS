import type { Document } from "mongodb";
import type { LatencyQuery } from "observability/cluster/interfaces/ClusterJournal";
import { HISTOGRAM_BASE, MAX_DURATION_MS } from "observability/cluster/core/histogram";

export function latencyPipeline(
    groupBy: LatencyQuery["groupBy"],
    intervalSeconds: number,
    timeField: string,
): Document[] {
    const key =
        groupBy === "capabilityId"
            ? {
                  $concat: [{ $ifNull: ["$contractId", "unknown"] }, "/", { $ifNull: ["$capabilityId", "unknown"] }],
              }
            : { $ifNull: [`$${groupBy}`, "unknown"] };
    return [
        { $match: { durationMs: { $type: "number", $gte: 0, $lte: MAX_DURATION_MS } } },
        {
            $project: {
                durationMs: 1,
                key,
                bucket: {
                    $floor: {
                        $divide: [
                            { $toLong: { $dateFromString: { dateString: `$${timeField}` } } },
                            intervalSeconds * 1000,
                        ],
                    },
                },
                index: {
                    $cond: [
                        { $lt: ["$durationMs", 1] },
                        0,
                        {
                            $add: [
                                1,
                                {
                                    $floor: {
                                        $divide: [{ $ln: { $max: [1, "$durationMs"] } }, Math.log(HISTOGRAM_BASE)],
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
        },
        {
            $group: {
                _id: { bucket: "$bucket", key: "$key", index: "$index" },
                count: { $sum: 1 },
                sum: { $sum: "$durationMs" },
                min: { $min: "$durationMs" },
                max: { $max: "$durationMs" },
            },
        },
        {
            $group: {
                _id: { bucket: "$_id.bucket", key: "$_id.key" },
                count: { $sum: "$count" },
                sum: { $sum: "$sum" },
                min: { $min: "$min" },
                max: { $max: "$max" },
                bins: { $push: { index: "$_id.index", count: "$count" } },
            },
        },
        { $limit: 501 },
        { $project: { _id: 0, bucket: "$_id.bucket", key: "$_id.key", count: 1, sum: 1, min: 1, max: 1, bins: 1 } },
    ];
}
