import { describe, expect, test } from "bun:test";
import { migrateLegacyAnalytics } from "@bernouy/cms-analytics/mongo";

describe("migrateLegacyAnalytics", () => {
    test("purges visitor rows and every unversioned unsafe aggregate idempotently", async () => {
        const filters = new Map<string, unknown>();
        const deleted = new Map([
            ["tenant_analytics_seen", 12],
            ["tenant_analytics_rollups", 34],
            ["tenant_analytics_hll_sketches", 2],
            ["tenant_analytics_referrer_buckets", 3],
        ]);
        const db = {
            collection: (name: string) => ({
                deleteMany: async (filter: unknown) => {
                    filters.set(name, filter);
                    return { deletedCount: deleted.get(name) ?? 0 };
                },
            }),
        };
        expect(await migrateLegacyAnalytics(db as never, "tenant_")).toEqual({
            removedVisitorRows: 12,
            removedLegacyRollups: 34,
            removedIncompatibleSketches: 2,
            removedIncompatibleReferrerBuckets: 3,
        });
        expect(filters.get("tenant_analytics_seen")).toEqual({});
        expect(filters.get("tenant_analytics_rollups")).toEqual({
            rollupVersion: { $ne: "strict-rollup-v1" },
        });
    });
});
