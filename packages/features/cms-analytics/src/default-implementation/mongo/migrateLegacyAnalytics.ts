import type { Db } from "mongodb";
import { ANALYTICS_VERSIONS } from "../../interfaces/AnalyticsPrivacy";

export type AnalyticsMigrationResult = {
    removedVisitorRows: number;
    removedLegacyRollups: number;
    removedIncompatibleSketches: number;
    removedIncompatibleReferrerBuckets: number;
};

/**
 * Idempotent privacy migration. Legacy rows cannot be safely reclassified,
 * so strict mode starts a fresh versioned aggregate series.
 */
export async function migrateLegacyAnalytics(db: Db, prefix = ""): Promise<AnalyticsMigrationResult> {
    const [seen, rollups, sketches, referrers] = await Promise.all([
        db.collection(prefix + "analytics_seen").deleteMany({}),
        db.collection(prefix + "analytics_rollups").deleteMany({ rollupVersion: { $ne: ANALYTICS_VERSIONS.rollup } }),
        db
            .collection(prefix + "analytics_hll_sketches")
            .deleteMany({ profileVersion: { $ne: ANALYTICS_VERSIONS.profile } }),
        db
            .collection(prefix + "analytics_referrer_buckets")
            .deleteMany({ rollupVersion: { $ne: ANALYTICS_VERSIONS.rollup } }),
    ]);
    return {
        removedVisitorRows: seen.deletedCount,
        removedLegacyRollups: rollups.deletedCount,
        removedIncompatibleSketches: sketches.deletedCount,
        removedIncompatibleReferrerBuckets: referrers.deletedCount,
    };
}
