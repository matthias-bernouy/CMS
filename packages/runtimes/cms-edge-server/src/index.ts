import { mountProductionEdge } from "./runtime/mountEdge";
import { ControlProviderClient } from "./runtime/gateway/ControlProviderClient";
import { createEdgeGateway } from "./runtime/gateway/createEdgeGateway";
import { fetchInstallationsProviderReport } from "./runtime/gateway/fetchProviderReport";
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
    await fetchInstallationsProviderReport(transport);
    const gateway = createEdgeGateway(new ControlProviderClient(transport, logger), logger);
    await connectEdgeDiagnostics(diagnostics, gateway);
    const edge = await mountProductionEdge({ env, gateway, logger });

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
