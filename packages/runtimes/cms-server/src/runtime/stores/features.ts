import { MongoDashboardAssignmentRepository, MongoDashboardRepository } from "@bernouy/cms-dashboards/mongo";
import { MongoIdentityService } from "@bernouy/cms-gateway/identity/mongo";
import type { Db } from "mongodb";

export async function createFeatureStores(db: Db) {
    const identities = new MongoIdentityService(db);
    await identities.init();
    const dashboardAssignments = new MongoDashboardAssignmentRepository(db);
    await dashboardAssignments.init();
    const dashboards = new MongoDashboardRepository(db);
    await dashboards.init();

    return {
        identities,
        dashboardAssignments,
        dashboards,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
