import type { RuntimeEnv } from "../runtimeEnv";
import { InMemoryCache } from "@bernouy/http-runner";
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
    runner.get("/healthz", emptyOk);
    runner.get("/readyz", emptyOk);
    new runtime.Kernel({
        runner,
        content: content.content,
        editorialPages: content.editorialPages,
        resolveActor: gateway.resolveActor,
        sessionCookie: { secure: env.KERNEL_PUBLIC_URL.startsWith("https:") },
        cache: new InMemoryCache(),
        enforcePageCsp: env.MODE !== "DEV",
        capabilityGateway: {
            siteId: "default",
            invoker: gateway.invoker,
            resolveCapability: gateway.resolveCapability,
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

function emptyOk(): Response {
    return new Response(null, { status: 204 });
}
