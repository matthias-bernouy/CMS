import type { Collection } from "mongodb";
import type { ReferrerBucketDoc, RollupDoc } from "../types";

export async function shortenMongoAnalyticsRetention(
    rollups: Collection<RollupDoc>,
    referrers: Collection<ReferrerBucketDoc>,
    retentionDays: number,
    now = new Date(),
): Promise<void> {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    await Promise.all([
        rollups.deleteMany({ bucket: { $lt: cutoff } }),
        referrers.deleteMany({ bucket: { $lt: cutoff } }),
        rollups.updateMany({}, expiryPipeline("$bucket", retentionDays)),
        referrers.updateMany({}, expiryPipeline("$bucket", retentionDays)),
    ]);
}

function expiryPipeline(bucket: string, retentionDays: number): Record<string, unknown>[] {
    return [
        {
            $set: {
                expiresAt: {
                    $min: ["$expiresAt", { $dateAdd: { startDate: bucket, unit: "day", amount: retentionDays } }],
                },
            },
        },
    ];
}
