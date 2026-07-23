import type { Collection } from "mongodb";
import { hourKey, truncateToHour } from "../../../core/rollups/buckets";
import { aggregateFrequentItems, emptyFrequentItems, updateFrequentItems } from "../../../core/referrers/FrequentItems";
import type { ReferrerBucketDoc } from "../types";
import { ANALYTICS_VERSIONS } from "../../../interfaces/AnalyticsPrivacy";

const MAX_CAS_ATTEMPTS = 8;

export async function updateReferrerBucket(
    buckets: Collection<ReferrerBucketDoc>,
    ts: Date,
    domain: string,
    capacity: number,
    retentionDays: number,
): Promise<void> {
    const bucket = truncateToHour(ts);
    const id = `referrer|${hourKey(ts)}`;
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const current = await buckets.findOne({ _id: id });
        const snapshot = current ?? emptyFrequentItems();
        const next = updateFrequentItems(snapshot, domain, capacity);
        const result = current
            ? await buckets.updateOne(
                  { _id: id, revision: current.revision },
                  { $set: { ...next, revision: current.revision + 1 } },
              )
            : await buckets.updateOne(
                  { _id: id },
                  {
                      $setOnInsert: {
                          bucket,
                          ...next,
                          revision: 1,
                          expiresAt: new Date(bucket.getTime() + retentionDays * 86_400_000),
                          filterVersion: ANALYTICS_VERSIONS.filter,
                          rollupVersion: ANALYTICS_VERSIONS.rollup,
                      },
                  },
                  { upsert: true },
              );
        if (result.modifiedCount === 1 || result.upsertedCount === 1) {
            return;
        }
    }
    throw new Error("analytics referrer bucket contention exceeded retry budget");
}

export async function readReferrerBuckets(
    buckets: Collection<ReferrerBucketDoc>,
    from: Date,
    to: Date,
): Promise<Array<{ key: string; count: number }>> {
    const documents = await buckets.find({ bucket: { $gte: from, $lt: to } }).toArray();
    return aggregateFrequentItems(documents);
}

export async function hasSaturatedReferrerBucket(
    buckets: Collection<ReferrerBucketDoc>,
    from: Date,
    to: Date,
): Promise<boolean> {
    return Boolean(await buckets.findOne({ bucket: { $gte: from, $lt: to }, saturated: true }));
}
