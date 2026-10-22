import type { RuntimeEnv } from "../runtimeEnv";
import { InMemoryCache } from "@bernouy/http-runner";
import { PRODUCTION_KERNEL_RUNTIME, type ProductionKernelRuntime } from "./kernelRuntime";
import type { ProviderKernelClient } from "./provider/ProviderKernelClient";
import type { Logger } from "@bernouy/logging";

export type { ProductionKernelRuntime } from "./kernelRuntime";

export type ProductionKernelHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    provider: ProviderKernelClient;
    logger: Logger;
};

export async function mountProductionKernel(
    options: MountOptions,
    runtime: ProductionKernelRuntime = PRODUCTION_KERNEL_RUNTIME,
): Promise<ProductionKernelHandle> {
    const { env, provider, logger } = options;
    const runner = new runtime.Runner({ logger });
    new runtime.Kernel({
        runner,
        content: provider.content,
        editorialPages: provider.editorialPages,
        resolveActor: (request) => provider.resolveActor(request),
        sessionCookie: { secure: env.KERNEL_PUBLIC_URL.startsWith("https:") },
        cache: new InMemoryCache(),
        enforcePageCsp: env.MODE !== "DEV",
        capabilityGateway: provider.gateway,
        pageCapabilities: provider.pageCapabilities,
        capabilityHandler: provider.capability,
        mutationHandler: provider.declarativeMutation,
        queryHandler: provider.declarativeQuery,
        collectionAssetHandler: provider.collectionAsset,
        collectionAssets: provider.collectionAssets,
        sitemapHandler: provider.sitemap,
        sitemapChunkHandler: provider.sitemap,
        logger,
    });
    runner.start({ port: env.KERNEL_PORT, hostname: env.KERNEL_HOST });
    logger.info("kernel.started", {
        publicUrl: env.KERNEL_PUBLIC_URL,
        providerUrl: env.ULVIA_PROVIDER_URL,
    });
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}
