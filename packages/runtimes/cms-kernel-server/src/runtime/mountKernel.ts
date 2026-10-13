import type { RuntimeEnv } from "../runtimeEnv";
import { InMemoryCache } from "@bernouy/http-runner";
import { PRODUCTION_KERNEL_RUNTIME, type ProductionKernelRuntime } from "./kernelRuntime";
import type { ProviderKernelClient } from "./provider/ProviderKernelClient";

export type { ProductionKernelRuntime } from "./kernelRuntime";

export type ProductionKernelHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    provider: ProviderKernelClient;
};

export async function mountProductionKernel(
    options: MountOptions,
    runtime: ProductionKernelRuntime = PRODUCTION_KERNEL_RUNTIME,
): Promise<ProductionKernelHandle> {
    const { env, provider } = options;
    const runner = new runtime.Runner();
    new runtime.Kernel({
        runner,
        content: provider.content,
        authentication: provider.authentication,
        publicAuth: { ...provider.publicAuth, allowSignup: false },
        authBackends: { local: provider.localAuthentication },
        identityProviders: provider.identityProviders,
        cache: new InMemoryCache(),
        enforcePageCsp: env.MODE !== "DEV",
        capabilityGateway: provider.gateway,
        pageExecution: provider.pageExecution,
        capabilityHandler: provider.capability,
        collectionAssetHandler: provider.collectionAsset,
        sitemapHandler: provider.sitemap,
        sitemapChunkHandler: provider.sitemap,
    });
    runner.start({ port: env.KERNEL_PORT, hostname: env.KERNEL_HOST });
    runtime.log("🚀 CMS listening");
    runtime.log(`   sign in:      ${env.KERNEL_PUBLIC_URL}/login`);
    runtime.log(`   site:         ${env.KERNEL_PUBLIC_URL}/`);
    runtime.log(`   provider:     ${env.ULVIA_PROVIDER_URL}`);
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}
