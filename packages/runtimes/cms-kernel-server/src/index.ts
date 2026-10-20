import { mountProductionKernel } from "./runtime/mountKernel";
import { fetchProviderHandshake } from "./runtime/gateway/fetchProviderReport";
import { ProviderKernelClient } from "./runtime/provider/ProviderKernelClient";
import { ProviderKernelTransport } from "./runtime/provider/ProviderKernelTransport";
import { readRuntimeEnv } from "./runtimeEnv";
import { createKernelLogger } from "./runtime/logger";

const logger = createKernelLogger(process.env);
try {
    await startKernel();
} catch (error) {
    logger.fatal("kernel.startup.failed", {}, error);
    throw error;
}

async function startKernel(): Promise<void> {
    const env = readRuntimeEnv(process.env);
    const transport = new ProviderKernelTransport(env.ULVIA_PROVIDER_URL, env.ULVIA_INSTANCE_TOKEN);
    await fetchProviderHandshake(transport);
    const provider = new ProviderKernelClient(transport, logger);
    const kernel = await mountProductionKernel({ env, provider, logger });

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
