import type { RuntimeEnv } from "../runtimeEnv";
import { createCmsMcpHandler } from "@bernouy/cms-edge";
import { PRODUCTION_EDGE_RUNTIME, type ProductionEdgeRuntime } from "./edgeRuntime";
import type { Logger } from "@bernouy/logging";
import type { createEdgeGateway } from "./gateway/createEdgeGateway";
import { createPublicResourceHandler } from "./publicResource";
export type { ProductionEdgeRuntime } from "./edgeRuntime";
export type ProductionEdgeHandle = { stop(): Promise<void> };
type MountOptions = { env: RuntimeEnv; gateway: ReturnType<typeof createEdgeGateway>; logger: Logger };
export async function mountProductionEdge(
    options: MountOptions,
    runtime: ProductionEdgeRuntime = PRODUCTION_EDGE_RUNTIME,
): Promise<ProductionEdgeHandle> {
    const { env, gateway, logger } = options;
    const runner = new runtime.Runner({ logger, idleTimeoutSeconds: 60 });
    runner.get("/healthz", () => new Response(null, { status: 204 }));
    runner.get("/readyz", () => new Response(null, { status: 204 }));
    new runtime.Edge({
        runner,
        logger,
        mcpHandler: createCmsMcpHandler({
            publicUrl: env.CMS_PUBLIC_URL,
            invoker: gateway.invoker,
            resolveActor: gateway.resolveActor,
            contracts: gateway.contracts,
        }),
        resolveActor: gateway.resolveActor,
        resourceHandler: createPublicResourceHandler(gateway.invoker, {
            reportOnly: env.MODE === "DEV",
            csp: env.CMS_CSP_ALLOWED_ORIGINS,
        }),
        sessionCookie: { secure: env.CMS_PUBLIC_URL.startsWith("https:") },
        capabilityGateway: {
            siteId: "default",
            invoker: gateway.invoker,
            authenticateProvider: gateway.authenticateProvider,
            resolveCapability: gateway.resolveCapability,
        },
    });
    runner.start({ port: env.CMS_PORT, hostname: env.CMS_HOST });
    logger.info("edge.started", {
        publicUrl: env.CMS_PUBLIC_URL,
        installationsProviderUrl: env.CMS_INSTALLATIONS_PROVIDER_URL,
    });
    return {
        async stop() {
            await runner.stopGracefully();
        },
    };
}
