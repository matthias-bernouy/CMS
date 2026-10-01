import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionAuthentication } from "./auth";
import type { CoreStores } from "./stores/core";
import { createPublicFileStores } from "./stores/authorFiles";
import type { FeatureStores } from "./stores/features";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import { ProviderManagement } from "./gateway/ProviderManagement";
import { observeGatewayInvoker } from "./gateway/observeGatewayInvoker";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";
import { createContentReader } from "@bernouy/cms-content/rendering";

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
    gateway?: ProductionGateway;
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<ProductionSurfaceHandle> {
    const { env, core, features, authentication, gateway } = options;
    const controlRunner = new runtime.Runner();
    const providerSources = env.CMS_REPOSITORY_URL ? [new HttpProviderRepository("local", env.CMS_REPOSITORY_URL)] : [];
    const controlCms = new runtime.Control(
        controlRunner,
        core.repo,
        authentication.auth,
        {
            deliveryUrl: env.DELIVERY_PUBLIC_URL,
            ...(gateway ? { administrator: gateway.isAdministrator } : {}),
            ...(gateway ? { administrators: gateway.administrators } : {}),
            collections: {
                store: core.collections,
                siteId: "default",
                sources: env.CMS_REPOSITORY_URL ? [new HttpCollectionRepository("local", env.CMS_REPOSITORY_URL)] : [],
            },
            ...(gateway
                ? {
                      providerResources: {
                          sources: providerSources,
                          contracts: gateway.releases,
                          manifests: gateway.manifests,
                          isAdministrator: gateway.isAdministrator,
                          management: new ProviderManagement(gateway, core.secrets, providerSources),
                      },
                  }
                : {}),
            analyticsCompliance: {
                cmsVersion: "0.1.0",
                secretReady: Boolean(options.analyticsVisitorSecret.trim()),
                siteScope: env.DELIVERY_PUBLIC_URL,
                trustProxy: env.ANALYTICS_TRUST_PROXY,
                trustedProxyVerified: env.ANALYTICS_TRUSTED_PROXY_VERIFIED,
                secureCookie: new URL(env.DELIVERY_PUBLIC_URL).protocol === "https:",
                optOutUrl: `${env.DELIVERY_PUBLIC_URL}/.cms/privacy/analytics`,
            },
            dashboardAssignments: features.dashboardAssignments,
            dashboards: features.dashboards,
            ...(gateway
                ? {
                      capabilityGateway: {
                          siteId: gateway.siteId,
                          invoker: observeGatewayInvoker(
                              gateway.invoker,
                              features.endpointPerformanceRecorder,
                              "control",
                          ),
                          images: gateway.images,
                          catalogue: gateway.catalogue,
                          isAdministrator: gateway.isAdministrator,
                      },
                  }
                : {}),
            identities: features.identities,
            endpointPerformanceReports: features.endpointPerformanceReports,
            publicAuth: {
                ...authentication.createPublicAuth({
                    emailVerificationUrl: env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                    passwordResetUrl: env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                    allowSignup: false,
                }),
                emailTest: authentication.createControlEmailTest(),
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
        features.analytics,
        { local: authentication.auth },
    );
    await controlCms.ready;

    const deliveryRunner = new runtime.Runner();
    const deliveryCms = new runtime.Delivery({
        runner: deliveryRunner,
        repository: createContentReader(core.repo),
        cache: core.cache,
        analytics: features.analytics,
        ...(gateway
            ? {
                  capabilityGateway: {
                      siteId: gateway.siteId,
                      invoker: observeGatewayInvoker(gateway.invoker, features.endpointPerformanceRecorder, "delivery"),
                      access: gateway.access,
                      images: gateway.images,
                  },
              }
            : {}),
        analyticsVisitorSecret: options.analyticsVisitorSecret,
        analyticsSiteScope: env.DELIVERY_PUBLIC_URL,
        analyticsTrustProxy: env.ANALYTICS_TRUST_PROXY,
        analyticsTrustedProxyVerified: env.ANALYTICS_TRUSTED_PROXY_VERIFIED,
        analyticsCmsVersion: "0.1.0",
        ...createPublicFileStores(core),
        auth: authentication.createPublicAuth({
            emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
            passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
        }),
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
    gateway?.observations?.start((error) => runtime.reportError("Provider observation refresh failed", error));
    runtime.log("🚀 CMS listening");
    runtime.log(`   admin:        ${env.CONTROL_PUBLIC_URL}/admin/`);
    runtime.log(`   sign in:      ${env.CONTROL_PUBLIC_URL}/login`);
    runtime.log(`   public site:  ${env.DELIVERY_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
    return {
        async stop() {
            endpointPerformanceFlusher.stop();
            await Promise.all([
                gateway?.observations?.stop(),
                sitemapRefresh?.stop(),
                controlRunner.stopGracefully(),
                deliveryRunner.stopGracefully(),
            ]);
            await endpointPerformanceFlusher.run();
        },
    };
}
