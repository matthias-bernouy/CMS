import { HttpCollectionRepository } from "@bernouy/cms-repository/collections/http";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionAuthentication } from "./auth";
import type { CoreStores } from "./stores/core";
import { createPublicFileStores } from "./stores/authorFiles";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import { ProviderManagement } from "./gateway/ProviderManagement";
import { PRODUCTION_SURFACE_RUNTIME, type ProductionSurfaceRuntime } from "./surfaceRuntime";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { mountLocalCoreCapabilities } from "./coreCapabilities";
import { DefaultCoreCapabilityDispatcher } from "@bernouy/cms-content";
import { registerOfficialCoreCapabilities } from "./core-contracts";
import { CoreOperationExecutor } from "./core-operations/CoreOperationExecutor";
import { CollectionSources } from "./core-contracts/collections/sources";

export type { ProductionSurfaceRuntime } from "./surfaceRuntime";

export type ProductionSurfaceHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    core: CoreStores;
    authentication: ProductionAuthentication;
    gateway?: ProductionGateway;
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<ProductionSurfaceHandle> {
    const { env, core, authentication, gateway } = options;
    const controlRunner = new runtime.Runner();
    const collectionRepositorySources = env.CMS_REPOSITORY_URL
        ? [new HttpCollectionRepository("local", env.CMS_REPOSITORY_URL)]
        : [];
    const providerSources = env.CMS_REPOSITORY_URL ? [new HttpProviderRepository("local", env.CMS_REPOSITORY_URL)] : [];
    const providerManagement = gateway ? new ProviderManagement(gateway, core.secrets, providerSources) : undefined;
    if (env.CMS_LOCAL_PROVIDER_TOKEN) {
        const dispatcher = new DefaultCoreCapabilityDispatcher();
        const operations = new CoreOperationExecutor(core.coreOperations);
        registerOfficialCoreCapabilities(
            dispatcher,
            core,
            gateway,
            operations,
            providerManagement,
            new CollectionSources(core.collections, collectionRepositorySources),
        );
        await operations.recover();
        mountLocalCoreCapabilities(controlRunner, dispatcher, env.CMS_LOCAL_PROVIDER_TOKEN);
    }
    const controlCms = new runtime.Control(controlRunner, core.repo, authentication.auth, {
        configuration: {
            deliveryUrl: env.DELIVERY_PUBLIC_URL,
            ...(gateway ? { administrator: gateway.isAdministrator } : {}),
            collections: {
                store: core.collections,
                siteId: "default",
                routes: core.pageRoutes,
                migrations: core.collectionMigrations,
            },
            ...(gateway
                ? {
                      capabilityGateway: {
                          siteId: gateway.siteId,
                          invoker: gateway.invoker,
                          images: gateway.images,
                          catalogue: gateway.catalogue,
                          pageExecutions: gateway.pageExecutions,
                          isAdministrator: gateway.isAdministrator,
                      },
                  }
                : {}),
            publicAuth: {
                ...authentication.createPublicAuth({
                    emailVerificationUrl: env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                    passwordResetUrl: env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                    allowSignup: false,
                }),
                emailTest: authentication.createControlEmailTest(),
            },
        },
        cache: core.cache,
        filesMetadata: core.filesMetadata,
        filesBlob: core.filesBlob,
        fileMutations: core.fileMutations,
        identityProviders: core.identityProviders,
        authBackends: { local: authentication.auth },
    });
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
