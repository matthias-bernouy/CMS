import { BufferedEndpointPerformanceRecorder, ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { MongoAnalyticsStore, MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";
import { MongoDashboardAssignmentRepository } from "@bernouy/cms-dashboards/mongo";
import { MongoIdentityService } from "@bernouy/cms-gateway/mongo";
import type { Db } from "mongodb";

type FeatureStoreOptions = {
    endpointPerformanceEnabled?: boolean;
};

export async function createFeatureStores(db: Db, options: FeatureStoreOptions = {}) {
    const identities = new MongoIdentityService(db);
    await identities.init();
    const dashboardAssignments = new MongoDashboardAssignmentRepository(db);
    await dashboardAssignments.init();

    const mongoAnalytics = new MongoAnalyticsStore(db);
    await mongoAnalytics.init();
    const analytics = new ValidatingAnalyticsStore(mongoAnalytics);
    const endpointPerformanceReports = new MongoEndpointPerformanceStore(db);
    await endpointPerformanceReports.init();
    const endpointPerformanceRecorder = new BufferedEndpointPerformanceRecorder(endpointPerformanceReports, {
        enabled: options.endpointPerformanceEnabled,
    });
    return {
        identities,
        dashboardAssignments,
        analytics,
        endpointPerformanceRecorder,
        endpointPerformanceReports,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
