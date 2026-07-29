import type { RuntimeEnv } from "../runtimeEnv";
import {
    mountCmsRepositoryManagementGateway,
    type RepositoryManagementGatewayTransport,
} from "@bernouy/cms-repository-management/gateway";
import type { ScheduledTriggerRunner } from "@bernouy/cms-triggers";
import {
    CmsSourceBindingMigrationHandler,
    CmsSourceFunctionalMigrationProbe,
    ProductionIntegrationMigrationRuntime,
} from "@bernouy/cms-integrations";
import type { ProductionAuthentication } from "./auth";
import type { ProductionIntegrationServices } from "./integrations";
import type { CoreStores } from "./stores/core";
import type { FeatureStores } from "./stores/features";
import { productionRepositoryReadConfig } from "./repository";
import { createSurfaceSourceTelemetry, createTrustedConnectorTargetMatcher } from "./sourceTelemetry";
import { createRuntimeSourceImageComposition } from "./sourceImageTelemetry";
import { createRuntimeSourceImageWorkers } from "./stores/sourceImages";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";
import { REPOSITORY_CATALOG_EDITOR_DATA_SOURCE } from "@bernouy/cms-repository/catalog";
import { createProductionRepositoryCatalogReader } from "../repositoryCatalog";
import { composeSourceEndpointInterceptors } from "@bernouy/cms-sources";

export type { ProductionSurfaceRuntime } from "./surfaceRuntime";

type MountOptions = {
    env: RuntimeEnv;
    analyticsVisitorSecret: string;
    core: CoreStores;
    features: FeatureStores;
    integrations: ProductionIntegrationServices;
    authentication: ProductionAuthentication;
    repositoryManagementGateway?: RepositoryManagementGatewayTransport;
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<ScheduledTriggerRunner> {
    const { env, core, features, integrations, authentication } = options;
    const repositoryCatalog = env.CMS_REPOSITORY_HUB_FACADE_ENABLED
        ? createProductionRepositoryCatalogReader(integrations)
        : undefined;
    const scheduledTriggers = runtime.startWorkers({
        functions: features.functions,
        sources: features.deliverySources,
        deps: { resolveSecret: features.resolveSecret, identities: features.identities },
        users: core.users,
        installations: features.integrationInstallations,
        triggers: features.triggers,
    });
    await scheduledTriggers.ready;
    const trustedConnectorTarget = await createTrustedConnectorTargetMatcher(
        integrations.integrationConnectorDeployers,
    );
    const sourceTelemetry = createSurfaceSourceTelemetry(features.endpointPerformanceRecorder, {
        uniformSampleRate: env.SOURCE_TIMING_SAMPLE_RATE,
        slowRequestThresholdMs: env.SOURCE_SLOW_REQUEST_THRESHOLD_MS,
        reportDiagnostic: runtime.log,
    });
    const cmsBindingDeps = {
        sources: features.sources,
        functions: features.functions,
        roles: core.roles,
        secrets: core.secrets,
        dashboards: features.dashboards,
        relations: features.relations,
        installations: features.integrationInstallations,
        triggers: features.triggers,
        sourceOverlays: features.sourceOverlays,
        connectorDeployers: integrations.integrationConnectorDeployers,
        provisioners: integrations.integrationProvisioners,
        sourceExecutorDeps: { resolveSecret: features.resolveSecret, identities: features.identities },
    };
    const cmsBindingMigration = new CmsSourceBindingMigrationHandler(cmsBindingDeps);
    const integrationMigrationRuntime = new ProductionIntegrationMigrationRuntime({
        connectorAdapters: integrations.integrationConnectorMigrationAdapters,
        functionDeployment: integrations.integrationFunctionMigrationHandler,
        targetSmoke: new CmsSourceFunctionalMigrationProbe(cmsBindingDeps, "target"),
        cmsBinding: cmsBindingMigration,
        cmsSmoke: new CmsSourceFunctionalMigrationProbe(cmsBindingDeps, "stable"),
    });
    const sourceImageWorkers =
        env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED && core.sourceImageCache
            ? createRuntimeSourceImageWorkers({
                  scope: env.DELIVERY_PUBLIC_URL,
                  cache: core.sourceImageCache,
                  queue: core.sourceImageJobs,
                  index: core.sourceMediaIndex,
                  sources: features.sources,
                  installations: features.integrationInstallations,
                  reportError: (error) => runtime.reportError("Source image worker failed", error),
              })
            : null;
    const sourceImageComposition = await createRuntimeSourceImageComposition({
        cache: core.sourceImageCache,
        transformsEnabled: env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED,
        responsivePublicMarkupEnabled:
            env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED && env.CMS_RESPONSIVE_PUBLIC_SOURCE_IMAGES_ENABLED,
        responsivePrivateMarkupEnabled:
            env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED && env.CMS_RESPONSIVE_PRIVATE_SOURCE_IMAGES_ENABLED,
        scope: env.DELIVERY_PUBLIC_URL,
        sampleRate: env.SOURCE_TIMING_SAMPLE_RATE,
        report: runtime.log,
        ...(sourceImageWorkers
            ? {
                  jobScheduler: sourceImageWorkers.scheduler,
                  mediaCoordinator: sourceImageWorkers.coordinator,
                  publicMissMode: "queued" as const,
              }
            : {}),
    });
    const sourceImageInterceptor =
        composeSourceEndpointInterceptors(sourceImageWorkers?.effects, sourceImageComposition.sourceImageInterceptor) ??
        sourceImageComposition.sourceImageInterceptor;
    const { responsivePublicSourceImagesEnabled, responsivePrivateSourceImagesEnabled } = sourceImageComposition;
    const controlRunner = new runtime.Runner();
    if (options.repositoryManagementGateway) {
        mountCmsRepositoryManagementGateway({
            runner: controlRunner,
            authentication: authentication.auth,
            requiredRole: "admin",
            transport: options.repositoryManagementGateway,
        });
    }
    const controlCms = new runtime.Control(
        controlRunner,
        core.repo,
        authentication.auth,
        {
            deliveryUrl: env.DELIVERY_PUBLIC_URL,
            analyticsCompliance: {
                cmsVersion: "0.1.0",
                secretReady: Boolean(options.analyticsVisitorSecret.trim()),
                siteScope: env.DELIVERY_PUBLIC_URL,
                trustProxy: env.ANALYTICS_TRUST_PROXY,
                trustedProxyVerified: env.ANALYTICS_TRUSTED_PROXY_VERIFIED,
                secureCookie: new URL(env.DELIVERY_PUBLIC_URL).protocol === "https:",
                optOutUrl: `${env.DELIVERY_PUBLIC_URL}/.cms/privacy/analytics`,
            },
            integrationCatalog: integrations.integrationCatalog,
            integrationPackageResolver: integrations.integrationPackageResolver,
            integrationUpgradeReleases: integrations.integrationUpgradeReleases,
            integrationInstallations: features.integrationInstallations,
            integrationConnectorProviders: features.integrationConnectorProviders,
            integrationConnectorDeployers: integrations.integrationConnectorDeployers,
            integrationMigrationRuntime,
            integrationConnectorBaselineAdopters: integrations.integrationConnectorBaselineAdopters,
            integrationProvisioners: integrations.integrationProvisioners,
            ...(repositoryCatalog ? { editorDataSources: [REPOSITORY_CATALOG_EDITOR_DATA_SOURCE] } : {}),
            dashboards: features.dashboards,
            relations: features.relations,
            functions: features.functions,
            triggers: features.triggers,
            scheduledTriggers: { enabled: true, runNow: scheduledTriggers.runNow },
            identities: features.identities,
            sourceOverlays: features.sourceOverlays,
            endpointPerformanceReports: features.endpointPerformanceReports,
            sourceTelemetry: sourceTelemetry.control,
            sourceImageInterceptor,
            responsivePublicSourceImagesEnabled,
            responsivePrivateSourceImagesEnabled,
            sourceTrustedConnectorTarget: trustedConnectorTarget,
            publicAuth: {
                ...authentication.publicAuthBase,
                emailVerificationUrl: env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                allowSignup: false,
            },
        },
        core.cache,
        core.secrets,
        core.filesMetadata,
        core.filesBlob,
        core.users,
        core.identityProviders,
        core.pats,
        core.credentials,
        features.sources,
        features.analytics,
        core.roles,
        { local: authentication.auth },
    );
    await controlCms.ready;

    const deliveryRunner = new runtime.Runner();
    if (repositoryCatalog) {
        const repositoryReads = productionRepositoryReadConfig(env, integrations, core, runtime.log);
        deliveryRunner.group("/.cms/repository", (repositoryRunner) => {
            new runtime.Repository({
                runner: repositoryRunner,
                ...repositoryReads,
                repositoryCatalog,
            });
        });
    }
    new runtime.Delivery({
        runner: deliveryRunner,
        repository: core.repo,
        cache: core.cache,
        sources: features.sources,
        sourceOverlays: features.sourceOverlays,
        sourceTelemetry: sourceTelemetry.delivery,
        sourceImageInterceptor,
        responsivePublicSourceImagesEnabled,
        responsivePrivateSourceImagesEnabled,
        sourceTrustedConnectorTarget: trustedConnectorTarget,
        analytics: features.analytics,
        functions: features.functions,
        triggers: features.triggers,
        identities: features.identities,
        integrationInstallations: features.integrationInstallations,
        analyticsVisitorSecret: options.analyticsVisitorSecret,
        analyticsSiteScope: env.DELIVERY_PUBLIC_URL,
        analyticsTrustProxy: env.ANALYTICS_TRUST_PROXY,
        analyticsTrustedProxyVerified: env.ANALYTICS_TRUSTED_PROXY_VERIFIED,
        analyticsCmsVersion: "0.1.0",
        sourceResolveSecret: features.resolveSecret,
        roles: core.roles,
        filesMetadata: core.filesMetadata,
        filesBlob: core.filesBlob,
        variantStore: core.variantStore,
        auth: {
            ...authentication.publicAuthBase,
            emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
            passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
        },
    });

    runtime.startAnalyticsFinalizer(features.analytics, {
        onError: (error) => runtime.reportError("Analytics visitor finalization failed", error),
    });
    const endpointPerformanceFlusher = runtime.startEndpointPerformanceFlusher(features.endpointPerformanceRecorder, {
        onError: (error) => runtime.reportError("Endpoint performance flush failed", error),
    });

    controlRunner.start(env.CONTROL_PORT);
    deliveryRunner.start(env.DELIVERY_PORT);
    runtime.log("🚀 CMS listening");
    runtime.log(`   admin:        ${env.CONTROL_PUBLIC_URL}/admin/`);
    runtime.log(`   sign in:      ${env.CONTROL_PUBLIC_URL}/login`);
    runtime.log(`   public site:  ${env.DELIVERY_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
    return {
        ready: scheduledTriggers.ready,
        runNow: scheduledTriggers.runNow,
        async stop() {
            endpointPerformanceFlusher.stop();
            await Promise.all([controlRunner.stopGracefully(), deliveryRunner.stopGracefully()]);
            await endpointPerformanceFlusher.run();
            await scheduledTriggers.stop();
            await sourceImageWorkers?.stop();
            await core.sourceImageCache?.dispose();
        },
    };
}
