import type { AnyBulkWriteOperation, Collection } from "mongodb";
import { isCountedEvent, eventToWrites } from "../../../core/rollups/eventToWrites";
import type { AnalyticsEvent } from "../../../interfaces/AnalyticsEvent";
import type { AnalyticsCollectionPolicy } from "../../../interfaces/AnalyticsPolicy";
import type { HllSketchDoc, ReferrerBucketDoc, RollupDoc } from "../types";
import { updateHllSketch } from "./hllSketches";
import { updateReferrerBucket } from "./referrerBuckets";

type Collections = {
    rollups: Collection<RollupDoc>;
    sketches: Collection<HllSketchDoc>;
    referrers: Collection<ReferrerBucketDoc>;
};

export async function recordMongoAnalytics(
    collections: Collections,
    event: AnalyticsEvent,
    policy: AnalyticsCollectionPolicy,
    stripe: number,
): Promise<void> {
    const operations: AnyBulkWriteOperation<RollupDoc>[] = eventToWrites(event, policy).map((write) => {
        const increment: Record<string, number> = { count: write.count };
        if (write.msSum !== undefined) {
            increment.msSum = write.msSum;
        }
        const update: Record<string, unknown> = {
            $inc: increment,
            $setOnInsert: {
                metric: write.metric,
                dim: write.dim,
                key: write.key,
                bucket: write.bucket,
                expiresAt: write.expiresAt,
                rollupVersion: write.rollupVersion,
            },
        };
        if (write.msMax !== undefined) {
            update.$max = { msMax: write.msMax };
        }
        return { updateOne: { filter: { _id: write.id }, update, upsert: true } };
    });
    if (operations.length > 0) {
        await collections.rollups.bulkWrite(operations, { ordered: true });
    }
    await Promise.all([
        isCountedEvent(event, policy) && policy.visitorEstimation && event.visitorHash
            ? updateHllSketch(collections.sketches, event.ts, event.visitorHash, stripe)
            : Promise.resolve(),
        isCountedEvent(event, policy) && event.entry && event.referrerDomain
            ? updateReferrerBucket(
                  collections.referrers,
                  event.ts,
                  event.referrerDomain,
                  policy.referrerCapacity,
                  policy.rollupRetentionDays,
              )
            : Promise.resolve(),
    ]);
}
