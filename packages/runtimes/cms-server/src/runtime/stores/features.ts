import { MongoDashboardAssignmentRepository, MongoDashboardRepository } from "@bernouy/cms-dashboards/mongo";
import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import { type CollectionMigrationWriteFence, withCollectionMigrationWriteFence } from "@bernouy/cms-content/migrations";
import type { Db } from "mongodb";

export async function createFeatureStores(db: Db, migrationFence: CollectionMigrationWriteFence) {
    const identities = new MongoIdentityService(db);
    await identities.init();
    const dashboardAssignments = new MongoDashboardAssignmentRepository(db);
    await dashboardAssignments.init();
    const dashboardRepository = new MongoDashboardRepository(db);
    await dashboardRepository.init();
    const dashboards = withCollectionMigrationWriteFence(
        dashboardRepository,
        migrationFence,
        (method, args) => String(method === "delete" ? args[0] : (args[0] as { siteId?: string })?.siteId),
        ["create", "replace", "delete"],
    );

    return {
        identities,
        dashboardAssignments,
        dashboards,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
