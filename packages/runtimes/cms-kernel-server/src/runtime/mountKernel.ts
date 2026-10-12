import type { RuntimeEnv } from "../runtimeEnv";
import { createContentReader } from "@bernouy/cms-content/rendering";
import { PageExecutionService } from "@bernouy/cms-gateway/execution";
import { isKernelReservedPath } from "@bernouy/cms-kernel";
import { createSitemapService, executeIndexingCapability } from "@bernouy/cms-seo";
import type { ProductionAuthentication } from "./auth";
import type { ProductionGateway } from "./gateway/createProductionGateway";
import { PRODUCTION_KERNEL_RUNTIME, type ProductionKernelRuntime } from "./kernelRuntime";
import type { KernelStores } from "./stores/kernelStores";

export type { ProductionKernelRuntime } from "./kernelRuntime";

export type ProductionKernelHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    core: KernelStores;
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
    const content = createContentReader(core.repo);
    const capabilityGateway = gateway
        ? {
              siteId: gateway.siteId,
              invoker: gateway.invoker,
              isAdministrator: gateway.isAdministrator,
              authenticateProvider: gateway.authenticateProvider,
          }
        : undefined;
    const pageExecution = gateway
        ? new PageExecutionService({
              siteId: gateway.siteId,
              content,
              invoker: gateway.invoker,
              authority: gateway.pageExecutions,
              resolveCapability: gateway.resolvePageCapability,
          })
        : undefined;
    new runtime.Kernel({
        runner,
        content,
        authentication: authentication.auth,
        publicAuth,
        authBackends: { local: authentication.auth },
        identityProviders: core.identityProviders,
        collections: {
            siteId: "default",
            migrations: core.collectionMigrations,
        },
        cache: core.cache,
        enforcePageCsp: env.MODE !== "DEV",
        collectionAssets: { siteId: "default", store: core.collections },
        ...(gateway
            ? {
                  capabilityGateway: capabilityGateway!,
                  pageExecution,
              }
            : {}),
        sitemapStore: core.sitemapStore,
    });
    runner.start({ port: env.KERNEL_PORT, hostname: env.KERNEL_HOST });
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    const sitemap = createSitemapService({
        store: core.sitemapStore,
        content,
        listAdditionalPaths: async () => [],
        isReservedPath: (path) => isKernelReservedPath(path, `${basePath}/.cms`),
        execute: (contractId, capabilityId, input) =>
            executeIndexingCapability(capabilityGateway, { kind: "anonymous" }, contractId, capabilityId, input),
    });
    const sitemapRefresh = runtime.startSitemapRefresh?.((signal) => sitemap.materialize(signal), {
        reportError: (error: unknown) => runtime.reportError("Sitemap refresh failed", error),
    });
    gateway?.observations?.start((error) => runtime.reportError("Provider observation refresh failed", error));
    runtime.log("🚀 CMS listening");
    runtime.log(`   sign in:      ${env.KERNEL_PUBLIC_URL}/login`);
    runtime.log(`   site:         ${env.KERNEL_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
    return {
        async stop() {
            await Promise.all([gateway?.observations?.stop(), sitemapRefresh?.stop(), runner.stopGracefully()]);
        },
    };
}
