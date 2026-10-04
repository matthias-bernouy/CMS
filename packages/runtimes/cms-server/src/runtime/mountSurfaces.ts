import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionAuthentication } from "./auth";
import type { CoreStores } from "./stores/core";
import { createPublicFileStores } from "./stores/authorFiles";
import type { FeatureStores } from "./stores/features";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import { ProviderManagement } from "./gateway/ProviderManagement";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";
import { createContentReader } from "@bernouy/cms-content/rendering";

export type { ProductionSurfaceRuntime } from "./surfaceRuntime";

export type ProductionSurfaceHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
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
                migrations: core.collectionMigrations,
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
            dashboardAssignments: features.dashboardAssignments,
            dashboards: features.dashboards,
            ...(gateway
                ? {
                      capabilityGateway: {
                          siteId: gateway.siteId,
                          invoker: gateway.invoker,
                          images: gateway.images,
                          catalogue: gateway.catalogue,
                          isAdministrator: gateway.isAdministrator,
                      },
                  }
                : {}),
            identities: features.identities,
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
        { local: authentication.auth },
    );
    await controlCms.ready;

    const deliveryRunner = new runtime.Runner();
    const deliveryCms = new runtime.Delivery({
        runner: deliveryRunner,
        repository: createContentReader(core.repo),
        cache: core.cache,
        maintenance: { siteId: "default", migrations: core.collectionMigrations },
        collectionAssets: { siteId: "default", store: core.collections },
        ...(gateway
            ? {
                  capabilityGateway: {
                      siteId: gateway.siteId,
                      invoker: gateway.invoker,
                      access: gateway.access,
                      images: gateway.images,
                  },
              }
            : {}),
        ...createPublicFileStores(core),
        auth: authentication.createPublicAuth({
            emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
            passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
        }),
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
            await Promise.all([
                gateway?.observations?.stop(),
                sitemapRefresh?.stop(),
                controlRunner.stopGracefully(),
                deliveryRunner.stopGracefully(),
            ]);
        },
    };
}
