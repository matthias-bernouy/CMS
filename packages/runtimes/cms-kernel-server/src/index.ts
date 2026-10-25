import { mountProductionKernel } from "./runtime/mountKernel";
import { ControlProviderClient } from "./runtime/gateway/ControlProviderClient";
import { createKernelGateway } from "./runtime/gateway/createKernelGateway";
import { fetchInstallationsProviderReport } from "./runtime/gateway/fetchProviderReport";
import { InstallationsProviderTransport } from "./runtime/gateway/InstallationsProviderTransport";
import { readRuntimeEnv } from "./runtimeEnv";
import { createKernelLogger } from "./runtime/logger";
import { GatewayContentClient } from "./runtime/content/GatewayContentClient";

const logger = createKernelLogger(process.env);
try {
    await startKernel();
} catch (error) {
    logger.fatal("kernel.startup.failed", {}, error);
    throw error;
}

async function startKernel(): Promise<void> {
    const env = readRuntimeEnv(process.env);
    const transport = new InstallationsProviderTransport(
        env.CMS_INSTALLATIONS_PROVIDER_URL,
        env.CMS_INSTALLATIONS_PROVIDER_TOKEN,
    );
    await fetchInstallationsProviderReport(transport);
    const gateway = createKernelGateway(new ControlProviderClient(transport, logger));
    const content = new GatewayContentClient(gateway.invoker, logger);
    const kernel = await mountProductionKernel({ env, content, gateway, logger });

    let stopping = false;
    const shutdown = async (signal: string) => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info("kernel.stopping", { signal });
        await kernel.stop();
    };
    const handleSignal = (signal: string): void => {
        void shutdown(signal).catch((error) => {
            logger.fatal("kernel.shutdown.failed", {}, error);
            process.exitCode = 1;
        });
    };
    process.on("SIGINT", () => handleSignal("SIGINT"));
    process.on("SIGTERM", () => handleSignal("SIGTERM"));
}
