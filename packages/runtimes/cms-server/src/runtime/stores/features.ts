import { BufferedEndpointPerformanceRecorder, ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { MongoAnalyticsStore, MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";
import {
    MongoDashboardAssignmentRepository,
    MongoDashboardRepository,
    MongoDashboardViewRepository,
} from "@bernouy/cms-dashboards/mongo";
import { MongoIdentityService } from "@bernouy/cms-identities/mongo";
import { MongoRelationRepository } from "@bernouy/cms-relations/mongo";
import { createSecretResolver, type SecretStore } from "@bernouy/cms-secrets";
import {
    CompositeSourceRepository,
    SourceOverlaySourceRepository,
    SYSTEM_SOURCES,
    type SourceTargetUrlValidationOptions,
    ValidatingSourceRepository,
} from "@bernouy/cms-sources";
import { MongoSourceOverlayRepository, MongoSourceRepository } from "@bernouy/cms-sources/mongo";
import type { Db } from "mongodb";

type FeatureStoreOptions = {
    endpointPerformanceEnabled?: boolean;
    sourceTargetValidation?: SourceTargetUrlValidationOptions;
};

export async function createFeatureStores(db: Db, secrets: SecretStore, options: FeatureStoreOptions = {}) {
    const mongoSources = new MongoSourceRepository(db);
    await mongoSources.init();
    const sources = new CompositeSourceRepository(
        new ValidatingSourceRepository(mongoSources, options.sourceTargetValidation),
        SYSTEM_SOURCES,
    );
    const sourceOverlays = new MongoSourceOverlayRepository(db);
    await sourceOverlays.init();

    const identities = new MongoIdentityService(db);
    await identities.init();
    const dashboards = new MongoDashboardRepository(db);
    await dashboards.init();
    const dashboardViews = new MongoDashboardViewRepository(db);
    await dashboardViews.init();
    const dashboardAssignments = new MongoDashboardAssignmentRepository(db);
    await dashboardAssignments.init();
    const relations = new MongoRelationRepository(db);
    await relations.init();

    const mongoAnalytics = new MongoAnalyticsStore(db);
    await mongoAnalytics.init();
    const analytics = new ValidatingAnalyticsStore(mongoAnalytics);
    const endpointPerformanceReports = new MongoEndpointPerformanceStore(db);
    await endpointPerformanceReports.init();
    const endpointPerformanceRecorder = new BufferedEndpointPerformanceRecorder(endpointPerformanceReports, {
        enabled: options.endpointPerformanceEnabled,
    });
    const resolveSecret = createSecretResolver(secrets);
    const deliverySources = new SourceOverlaySourceRepository(sources, sourceOverlays, {
        deps: { resolveSecret, identities },
    });

    return {
        sources,
        sourceOverlays,
        identities,
        dashboards,
        dashboardViews,
        dashboardAssignments,
        relations,
        analytics,
        endpointPerformanceRecorder,
        endpointPerformanceReports,
        resolveSecret,
        deliverySources,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
