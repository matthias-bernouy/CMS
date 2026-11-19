import { BunRunner } from "@bernouy/http-runner";
import { createNodeLogger } from "@bernouy/logging/node";
import { readRuntimeEnv } from "./runtimeEnv";
import { RoutingClient } from "./runtime/hosting/client/RoutingClient";
import { SharedEdge } from "./runtime/hosting/SharedEdge";
import { createTenantContext } from "./runtime/hosting/context";

const logger = createNodeLogger({ service: "cms-edge-host", format: "json", level: "info", includeErrorStack: true });
try {
    const env = readRuntimeEnv(process.env);
    const routing = new RoutingClient(env.CMS_HOSTING_PROVIDER_URL, env.CMS_HOSTING_EDGE_SECRET);
    await routing.resolve("readiness.invalid");
    const edge = new SharedEdge(routing, (route) => createTenantContext(env, route, routing), logger, {
        maxEntries: env.CMS_EDGE_MAX_CONTEXTS,
        maxPending: 4,
        admission: { maxQueued: 64, waitMs: 30_000 },
        maxWaiters: 64,
        idleMs: 60_000,
    });
    const runner = new BunRunner({ logger, idleTimeoutSeconds: 60 });
    runner.get("/healthz", () => new Response(null, { status: 204 }));
    runner.get("/readyz", async () => {
        try {
            await routing.resolve("readiness.invalid");
            return new Response(null, { status: 204 });
        } catch {
            return new Response(null, { status: 503 });
        }
    });
    for (const method of ["GET", "HEAD", "QUERY", "POST", "PUT", "PATCH", "DELETE"] as const) {
        runner.setDefaultEndpoint(method, (request) => edge.handle(request));
    }
    runner.start({ port: env.CMS_PORT, hostname: env.CMS_HOST });
    logger.info("edge.started", {
        hostingProviderUrl: env.CMS_HOSTING_PROVIDER_URL,
        maxContexts: env.CMS_EDGE_MAX_CONTEXTS,
    });
    let stopping = false;
    const shutdown = async () => {
        if (stopping) {
            return;
        }
        stopping = true;
        await runner.stopGracefully();
        await edge.close();
    };
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.on(signal, () => {
            void shutdown().catch((error) => {
                logger.fatal("edge.shutdown.failed", {}, error);
                process.exitCode = 1;
            });
        });
    }
} catch (error) {
    logger.fatal("edge.startup.failed", {}, error);
    throw error;
}
