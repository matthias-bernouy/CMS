import type { RuntimeEnv } from "../runtimeEnv";
import type { ProductionAuthentication } from "./auth";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import { PRODUCTION_KERNEL_RUNTIME, type ProductionKernelRuntime } from "./kernelRuntime";
import type { CoreStores } from "./stores/core";

export type { ProductionKernelRuntime } from "./kernelRuntime";

export type ProductionKernelHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    core: CoreStores;
    authentication: ProductionAuthentication;
    gateway?: ProductionGateway;
};

export async function mountProductionKernel(
    options: MountOptions,
    runtime: ProductionKernelRuntime = PRODUCTION_KERNEL_RUNTIME,
): Promise<ProductionKernelHandle> {
    const { env, core, authentication, gateway } = options;
    const runner = new runtime.Runner();
    const publicAuth = authentication.createPublicAuth({
        emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
        passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
        allowSignup: false,
    });
    const kernel = new runtime.Kernel({
        runner,
        repository: core.repo,
        authentication: authentication.auth,
        publicAuth,
        authBackends: { local: authentication.auth },
        identityProviders: core.identityProviders,
        collections: {
            siteId: "default",
            migrations: core.collectionMigrations,
        },
        cache: core.cache,
        collectionAssets: { siteId: "default", store: core.collections },
        ...(gateway
            ? {
                  capabilityGateway: {
                      siteId: gateway.siteId,
                      invoker: gateway.invoker,
                      catalogue: gateway.catalogue,
                      pageExecutions: gateway.pageExecutions,
                      isAdministrator: gateway.isAdministrator,
                      authenticateProvider: gateway.authenticateProvider,
                      resolveCapabilityAccess: gateway.resolveCapabilityAccess,
                  },
              }
            : {}),
        sitemapStore: core.sitemapStore,
    });
    await kernel.ready;

    runner.start({ port: env.KERNEL_PORT, hostname: env.KERNEL_HOST });
    const sitemapRefresh = runtime.startSitemapRefresh?.(kernel, {
        reportError: (error: unknown) => runtime.reportError("Sitemap refresh failed", error),
    });
    gateway?.observations?.start((error) => runtime.reportError("Provider observation refresh failed", error));
    runtime.log("🚀 CMS listening");
    runtime.log(`   admin:        ${env.KERNEL_PUBLIC_URL}/admin`);
    runtime.log(`   sign in:      ${env.KERNEL_PUBLIC_URL}/login`);
    runtime.log(`   site:         ${env.KERNEL_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
    return {
        async stop() {
            await Promise.all([gateway?.observations?.stop(), sitemapRefresh?.stop(), runner.stopGracefully()]);
        },
    };
}
