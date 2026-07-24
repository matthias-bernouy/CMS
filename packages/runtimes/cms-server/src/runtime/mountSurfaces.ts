import type { RuntimeEnv } from "../runtimeEnv";
import type { ScheduledTriggerRunner } from "@bernouy/cms-triggers";
import type { ProductionAuthentication } from "./auth";
import type { ProductionIntegrationServices } from "./integrations";
import type { CoreStores } from "./stores/core";
import type { FeatureStores } from "./stores/features";
import { createSourceTelemetryOptions, createTrustedConnectorTargetMatcher } from "./sourceTelemetry";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";

export type { ProductionSurfaceRuntime } from "./surfaceRuntime";

type MountOptions = {
    env: RuntimeEnv;
    analyticsVisitorSecret: string;
    core: CoreStores;
    features: FeatureStores;
    integrations: ProductionIntegrationServices;
    authentication: ProductionAuthentication;
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<ScheduledTriggerRunner> {
    const { env, core, features, integrations, authentication } = options;
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
    const telemetryConfig = {
        uniformSampleRate: env.SOURCE_TIMING_SAMPLE_RATE,
        slowRequestThresholdMs: env.SOURCE_SLOW_REQUEST_THRESHOLD_MS,
        reportDiagnostic: runtime.log,
    };
    const controlTelemetry = createSourceTelemetryOptions(
        "control",
        features.endpointPerformanceRecorder,
        telemetryConfig,
    );
    const deliveryTelemetry = createSourceTelemetryOptions(
        "delivery",
        features.endpointPerformanceRecorder,
        telemetryConfig,
    );
    const controlRunner = new runtime.Runner();
    controlRunner.group("/.cms/repository", (repositoryRunner) => {
        new runtime.Repository({
            runner: repositoryRunner,
            integrationCatalog: integrations.integrationRepositoryCatalog,
        });
    });
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
            integrationInstallations: features.integrationInstallations,
            integrationConnectorProviders: features.integrationConnectorProviders,
            integrationConnectorDeployers: integrations.integrationConnectorDeployers,
            integrationProvisioners: integrations.integrationProvisioners,
            dashboards: features.dashboards,
            relations: features.relations,
            functions: features.functions,
            triggers: features.triggers,
            scheduledTriggers: { enabled: true, runNow: scheduledTriggers.runNow },
            identities: features.identities,
            sourceOverlays: features.sourceOverlays,
            endpointPerformanceReports: features.endpointPerformanceReports,
            sourceTelemetry: controlTelemetry,
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
    new runtime.Delivery({
        runner: deliveryRunner,
        repository: core.repo,
        cache: core.cache,
        sources: features.sources,
        sourceOverlays: features.sourceOverlays,
        sourceTelemetry: deliveryTelemetry,
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
        },
    };
}
