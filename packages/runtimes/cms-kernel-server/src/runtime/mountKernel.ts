import type { RuntimeEnv } from "../runtimeEnv";
import { createCmsMcpHandler } from "@bernouy/cms-kernel";
import { InMemoryCache } from "@bernouy/http-runner";
import { CMS_CACHE_KEYS } from "@bernouy/cms-content/rendering";
import {
    blocRuntimeCacheKey,
    loadBindingCoreRuntimeEntry,
    loadBlocRuntimeEntry,
} from "@bernouy/cms-content/runtime-assets";
import { PRODUCTION_KERNEL_RUNTIME, type ProductionKernelRuntime } from "./kernelRuntime";
import type { Logger } from "@bernouy/logging";
import type { createKernelGateway } from "./gateway/createKernelGateway";
import type { GatewayContentClient } from "./content/GatewayContentClient";

export type { ProductionKernelRuntime } from "./kernelRuntime";

export type ProductionKernelHandle = {
    stop(): Promise<void>;
};

type MountOptions = {
    env: RuntimeEnv;
    content: GatewayContentClient;
    gateway: ReturnType<typeof createKernelGateway>;
    logger: Logger;
};

export async function mountProductionKernel(
    options: MountOptions,
    runtime: ProductionKernelRuntime = PRODUCTION_KERNEL_RUNTIME,
): Promise<ProductionKernelHandle> {
    const { env, content, gateway, logger } = options;
    const runner = new runtime.Runner({ logger, idleTimeoutSeconds: 60 });
    const cache = new InMemoryCache();
    const basePath = runner.basePath === "/" ? "" : runner.basePath;
    await prewarmBrowserRuntimes(cache, `${basePath}/.cms`, logger);
    runner.get("/healthz", emptyOk);
    runner.get("/readyz", emptyOk);
    const onMutationSuccess = ({ contractId }: { contractId: string }) => {
        if (contractId === "ulvia.cms.content" || contractId === "ulvia.cms.installations") {
            content.invalidatePageRenderInputs();
        }
    };
    new runtime.Kernel({
        runner,
        mcpHandler: createCmsMcpHandler({
            publicUrl: env.KERNEL_PUBLIC_URL,
            invoker: gateway.invoker,
            resolveActor: gateway.resolveActor,
            contracts: gateway.contracts,
            onMutationSuccess,
        }),
        content: content.content,
        editorialPages: content.editorialPages,
        resolveActor: gateway.resolveActor,
        sessionCookie: { secure: env.KERNEL_PUBLIC_URL.startsWith("https:") },
        cache,
        enforcePageCsp: env.MODE !== "DEV",
        capabilityGateway: {
            siteId: "default",
            invoker: gateway.invoker,
            authenticateProvider: gateway.authenticateProvider,
            resolveCapability: gateway.resolveCapability,
            onMutationSuccess,
        },
        pageCapabilities: gateway.pageCapabilities,
        collectionAssets: content.collectionAssets,
        sitemapHandler: content.sitemap.bind(content),
        sitemapChunkHandler: content.sitemap.bind(content),
        robotsHandler: content.robots.bind(content),
        logger,
    });
    runner.start({ port: env.KERNEL_PORT, hostname: env.KERNEL_HOST });
    logger.info("kernel.started", {
        publicUrl: env.KERNEL_PUBLIC_URL,
        installationsProviderUrl: env.CMS_INSTALLATIONS_PROVIDER_URL,
    });
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}

async function prewarmBrowserRuntimes(cache: InMemoryCache, cmsPathPrefix: string, logger: Logger): Promise<void> {
    const startedAt = performance.now();
    const blocRuntimePath = `${cmsPathPrefix}/assets/bloc-runtime.js`;
    const bindingRuntimePath = `${cmsPathPrefix}/assets/cms-binding-core.js`;
    const [blocRuntime, bindingRuntime] = await Promise.all([loadBlocRuntimeEntry(), loadBindingCoreRuntimeEntry()]);
    cache.set(blocRuntimeCacheKey(blocRuntimePath), blocRuntime);
    cache.set(CMS_CACHE_KEYS.js(bindingRuntimePath), bindingRuntime);
    logger.info("kernel.browser-runtimes.prewarmed", {
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        entries: 2,
    });
}

function emptyOk(): Response {
    return new Response(null, { status: 204 });
}
