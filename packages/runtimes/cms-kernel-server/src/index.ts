import { mountProductionKernel } from "./runtime/mountKernel";
import { fetchProviderHandshake } from "./runtime/gateway/fetchProviderReport";
import { ProviderKernelClient } from "./runtime/provider/ProviderKernelClient";
import { ProviderKernelTransport } from "./runtime/provider/ProviderKernelTransport";
import { readRuntimeEnv } from "./runtimeEnv";

const env = readRuntimeEnv(process.env);
const transport = new ProviderKernelTransport(env.ULVIA_PROVIDER_URL, env.ULVIA_INSTANCE_TOKEN);
await fetchProviderHandshake(transport);
const provider = new ProviderKernelClient(transport, env.KERNEL_PUBLIC_URL);
const kernel = await mountProductionKernel({ env, provider });

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\n→ Stopping (${signal})...`);
    await kernel.stop();
};
const handleSignal = (signal: string): void => {
    void shutdown(signal).catch((error) => {
        console.error("CMS shutdown failed", error);
        process.exitCode = 1;
    });
};
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));
