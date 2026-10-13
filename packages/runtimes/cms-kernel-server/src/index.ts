import { createProductionAuth } from "./runtime/auth";
import { mountProductionKernel } from "./runtime/mountKernel";
import { createKernelStores } from "./runtime/stores/kernelStores";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { fetchProviderHandshake } from "./runtime/gateway/fetchProviderReport";
import { assertProvisionedInstance } from "./runtime/gateway/assertProvisionedInstance";
import { readRuntimeEnv } from "./runtimeEnv";

const SITE_ID = "default";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createKernelStores(env);
const authentication = await createProductionAuth(env, core);
const gateway = await createProductionGateway(core.db, core.secrets, core.identities, SITE_ID);
try {
    const handshake = await fetchProviderHandshake(env.ULVIA_PROVIDER_URL, env.ULVIA_INSTANCE_TOKEN);
    await assertProvisionedInstance(gateway, env.ULVIA_PROVIDER_URL, handshake.runtime);
} catch (error) {
    await core.close();
    throw error;
}
let kernel;
try {
    kernel = await mountProductionKernel({
        env,
        core,
        authentication,
        gateway,
    });
} catch (error) {
    await core.close();
    throw error;
}

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\n→ Stopping (${signal})...`);
    try {
        await kernel.stop();
    } finally {
        await core.close();
    }
};
const handleSignal = (signal: string): void => {
    void shutdown(signal).catch((error) => {
        console.error("CMS shutdown failed", error);
        process.exitCode = 1;
    });
};
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));
