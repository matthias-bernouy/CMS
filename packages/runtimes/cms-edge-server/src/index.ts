import { ResponseCache } from "./runtime/resources/cache/ResponseCache";
import { commandCacheEffect, commandCacheTags } from "./runtime/resources/cache/commandPolicy";
import { mountProductionEdge } from "./runtime/mountEdge";
import { ControlProviderClient } from "./runtime/gateway/ControlProviderClient";
import { createEdgeGateway } from "./runtime/gateway/createEdgeGateway";
import { fetchInstallationsProviderReport, installationsControlContract } from "./runtime/gateway/fetchProviderReport";
import { InstallationsProviderTransport } from "./runtime/gateway/InstallationsProviderTransport";
import { readRuntimeEnv } from "./runtimeEnv";
import { createEdgeDiagnostics, connectEdgeDiagnostics } from "./runtime/diagnostics";

const diagnostics = createEdgeDiagnostics(process.env);
const { logger } = diagnostics;
try {
    await startEdge();
} catch (error) {
    logger.fatal("edge.startup.failed", {}, error);
    throw error;
}

async function startEdge(): Promise<void> {
    const env = readRuntimeEnv(process.env);
    const transport = new InstallationsProviderTransport(
        env.CMS_INSTALLATIONS_PROVIDER_URL,
        env.CMS_INSTALLATIONS_PROVIDER_TOKEN,
    );
    const report = await fetchInstallationsProviderReport(transport);
    const cache = new ResponseCache({
        enabled: env.CMS_EDGE_RESPONSE_CACHE,
        event: (outcome) => logger.debug("edge.resource.cache", { outcome }),
    });
    const gateway = createEdgeGateway(
        new ControlProviderClient(transport, logger, installationsControlContract(report)),
        logger,
        (contractId, capabilityId) => {
            const effect = commandCacheEffect(contractId, capabilityId);
            if (effect !== "neutral") {
                cache.purge(commandCacheTags(contractId));
            }
        },
    );
    await connectEdgeDiagnostics(diagnostics, gateway);
    const edge = await mountProductionEdge({ env, gateway, logger, cache });

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info("edge.stopping", { signal });
        await edge.stop();
        await diagnostics.collector.close();
    };
    const handleSignal = (signal: string): void => {
        void shutdown(signal).catch((error) => {
            logger.fatal("edge.shutdown.failed", {}, error);
            process.exitCode = 1;
        });
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));
}
