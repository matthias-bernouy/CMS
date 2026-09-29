import { BufferedEndpointPerformanceRecorder, ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { MongoAnalyticsStore, MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";
import { MongoDashboardAssignmentRepository } from "@bernouy/cms-dashboards/mongo";
import { MongoIdentityService } from "@bernouy/cms-gateway/mongo";
import { createSecretResolver, type SecretStore } from "@bernouy/cms-secrets";
import { type SourceTargetUrlValidationOptions, ValidatingSourceRepository } from "@bernouy/cms-sources";
import { MongoSourceRepository } from "@bernouy/cms-sources/mongo";
import type { Db } from "mongodb";

type FeatureStoreOptions = {
    endpointPerformanceEnabled?: boolean;
    sourceTargetValidation?: SourceTargetUrlValidationOptions;
};

export async function createFeatureStores(db: Db, secrets: SecretStore, options: FeatureStoreOptions = {}) {
    const mongoSources = new MongoSourceRepository(db);
    await mongoSources.init();
    const sources = new ValidatingSourceRepository(mongoSources, options.sourceTargetValidation);
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
    const resolveSecret = createSecretResolver(secrets);
    return {
        sources,
        identities,
        dashboardAssignments,
        analytics,
        endpointPerformanceRecorder,
        endpointPerformanceReports,
        resolveSecret,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
