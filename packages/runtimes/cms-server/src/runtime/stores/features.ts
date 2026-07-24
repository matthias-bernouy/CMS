import { BufferedEndpointPerformanceRecorder, ValidatingAnalyticsStore } from "@bernouy/cms-analytics";
import { MongoAnalyticsStore, MongoEndpointPerformanceStore } from "@bernouy/cms-analytics/mongo";
import { MongoDashboardRepository } from "@bernouy/cms-dashboards/mongo";
import { MongoFunctionRepository } from "@bernouy/cms-functions/mongo";
import { MongoIdentityService } from "@bernouy/cms-identities/mongo";
import {
    MongoIntegrationConnectorProviderRepository,
    MongoIntegrationInstallationRepository,
} from "@bernouy/cms-integrations/mongo";
import { MongoRelationRepository } from "@bernouy/cms-relations/mongo";
import { createSecretResolver, type SecretStore } from "@bernouy/cms-secrets";
import {
    CompositeSourceRepository,
    SourceOverlaySourceRepository,
    SYSTEM_SOURCES,
    ValidatingSourceRepository,
} from "@bernouy/cms-sources";
import { MongoSourceOverlayRepository, MongoSourceRepository } from "@bernouy/cms-sources/mongo";
import { MongoTriggerRepository } from "@bernouy/cms-triggers/mongo";
import type { Db } from "mongodb";

type FeatureStoreOptions = {
    endpointPerformanceEnabled?: boolean;
};

export async function createFeatureStores(db: Db, secrets: SecretStore, options: FeatureStoreOptions = {}) {
    const mongoSources = new MongoSourceRepository(db);
    await mongoSources.init();
    const sources = new CompositeSourceRepository(new ValidatingSourceRepository(mongoSources), SYSTEM_SOURCES);
    const sourceOverlays = new MongoSourceOverlayRepository(db);
    await sourceOverlays.init();

    const functions = new MongoFunctionRepository(db);
    await functions.init();
    const triggers = new MongoTriggerRepository(db);
    await triggers.init();
    const identities = new MongoIdentityService(db);
    await identities.init();
    const dashboards = new MongoDashboardRepository(db);
    await dashboards.init();
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
    const integrationInstallations = new MongoIntegrationInstallationRepository(db);
    await integrationInstallations.init();
    const integrationConnectorProviders = new MongoIntegrationConnectorProviderRepository(db);

    const resolveSecret = createSecretResolver(secrets);
    const deliverySources = new SourceOverlaySourceRepository(sources, sourceOverlays, {
        deps: { resolveSecret, identities },
    });

    return {
        sources,
        sourceOverlays,
        functions,
        triggers,
        identities,
        dashboards,
        relations,
        analytics,
        endpointPerformanceRecorder,
        endpointPerformanceReports,
        integrationInstallations,
        integrationConnectorProviders,
        resolveSecret,
        deliverySources,
    };
}

export type FeatureStores = Awaited<ReturnType<typeof createFeatureStores>>;
