import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionAuthentication } from "./auth";
import type { CoreStores } from "./stores/core";
import type { FeatureStores } from "./stores/features";
import { createSurfaceSourceTelemetry } from "./sourceTelemetry";
import { createRuntimeSourceImageComposition } from "./sourceImageTelemetry";
import { createRuntimeSourceImageWorkers } from "./stores/sourceImages";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";
import { composeSourceEndpointInterceptors } from "@bernouy/cms-sources";

export type { ProductionSurfaceRuntime } from "./surfaceRuntime";

export type ProductionSurfaceHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    analyticsVisitorSecret: string;
    core: CoreStores;
    features: FeatureStores;
    authentication: ProductionAuthentication;
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<ProductionSurfaceHandle> {
    const { env, core, features, authentication } = options;
    const sourceTelemetry = createSurfaceSourceTelemetry(features.endpointPerformanceRecorder, {
        uniformSampleRate: env.SOURCE_TIMING_SAMPLE_RATE,
        slowRequestThresholdMs: env.SOURCE_SLOW_REQUEST_THRESHOLD_MS,
        reportDiagnostic: runtime.log,
    });
    const sourceImageWorkers =
        env.CMS_SOURCE_IMAGE_TRANSFORMS_ENABLED && core.sourceImageCache
            ? createRuntimeSourceImageWorkers({
                  scope: env.DELIVERY_PUBLIC_URL,
                  cache: core.sourceImageCache,
                  queue: core.sourceImageJobs,
                  index: core.sourceMediaIndex,
                  sources: features.sources,
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
            dashboards: features.dashboards,
            dashboardViews: features.dashboardViews,
            dashboardAssignments: features.dashboardAssignments,
            relations: features.relations,
            identities: features.identities,
            sourceOverlays: features.sourceOverlays,
            endpointPerformanceReports: features.endpointPerformanceReports,
            sourceTelemetry: sourceTelemetry.control,
            sourceImageInterceptor,
            responsivePublicSourceImagesEnabled,
            responsivePrivateSourceImagesEnabled,
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
    const deliveryCms = new runtime.Delivery({
        runner: deliveryRunner,
        repository: core.repo,
        cache: core.cache,
        sources: features.sources,
        sourceOverlays: features.sourceOverlays,
        sourceTelemetry: sourceTelemetry.delivery,
        sourceImageInterceptor,
        responsivePublicSourceImagesEnabled,
        responsivePrivateSourceImagesEnabled,
        analytics: features.analytics,
        identities: features.identities,
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
        sitemapStore: core.sitemapStore,
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
    const sitemapRefresh = runtime.startSitemapRefresh?.(deliveryCms, {
        reportError: (error) => runtime.reportError("Sitemap refresh failed", error),
    });
    runtime.log("🚀 CMS listening");
    runtime.log(`   admin:        ${env.CONTROL_PUBLIC_URL}/admin/`);
    runtime.log(`   sign in:      ${env.CONTROL_PUBLIC_URL}/login`);
    runtime.log(`   public site:  ${env.DELIVERY_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
    return {
        async stop() {
            endpointPerformanceFlusher.stop();
            await Promise.all([
                sitemapRefresh?.stop(),
                controlRunner.stopGracefully(),
                deliveryRunner.stopGracefully(),
            ]);
            await endpointPerformanceFlusher.run();
            await sourceImageWorkers?.stop();
            await core.sourceImageCache?.dispose();
        },
    };
}
