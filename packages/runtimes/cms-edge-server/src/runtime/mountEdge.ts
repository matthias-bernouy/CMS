import type { ResponseCache } from "./resources/cache/ResponseCache";
import type { RuntimeEnv } from "../runtimeEnv";
import { createCmsMcpHandler } from "@bernouy/cms-edge";
import { PRODUCTION_EDGE_RUNTIME, type ProductionEdgeRuntime } from "./edgeRuntime";
import type { Logger } from "@bernouy/logging";
import type { createEdgeGateway } from "./gateway/createEdgeGateway";
import { createPublicResourceHandler } from "./resources/publicResource";
export type { ProductionEdgeRuntime } from "./edgeRuntime";
export type ProductionEdgeHandle = { handle(request: Request): Promise<Response> };
type MountOptions = {
    env: Pick<RuntimeEnv, "MODE" | "CMS_CSP_ALLOWED_ORIGINS"> & { CMS_PUBLIC_URL: string };
    gateway: ReturnType<typeof createEdgeGateway>;
    logger: Logger;
    cache?: ResponseCache;
};
export function createTenantEdge(
    options: MountOptions,
    runtime: ProductionEdgeRuntime = PRODUCTION_EDGE_RUNTIME,
): ProductionEdgeHandle {
    const { env, gateway, logger } = options;
    const runner = new runtime.Runner({ logger, idleTimeoutSeconds: 60 });

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
        resourceHandler: createPublicResourceHandler(
            gateway.invoker,
            {
                reportOnly: env.MODE === "DEV",
                csp: env.CMS_CSP_ALLOWED_ORIGINS,
            },
            options.cache,
        ),
        sessionCookie: { secure: env.CMS_PUBLIC_URL.startsWith("https:") },
        capabilityGateway: {
            siteId: "default",
            invoker: gateway.invoker,
            authenticateProvider: gateway.authenticateProvider,
            invokeProvider: gateway.invokeProvider,
            resolveCapability: gateway.resolveCapability,
        },
    });
    return { handle: (request) => runner.handle(request) };
}
