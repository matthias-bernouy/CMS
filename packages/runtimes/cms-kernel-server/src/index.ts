import { createProductionAuth } from "./runtime/auth";
import { mountProductionKernel } from "./runtime/mountKernel";
import { createKernelStores } from "./runtime/stores/kernelStores";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { fetchProviderReport } from "./runtime/gateway/fetchProviderReport";
import { readRuntimeEnv } from "./runtimeEnv";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import { bootstrapOfficialResources } from "./runtime/gateway/bootstrapOfficialResources";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createKernelStores(env);
const authentication = await createProductionAuth(env, core);
const gateway = env.CMS_GATEWAY_SITE_ID
    ? await createProductionGateway(
          core.db,
          core.secrets,
          core.credentials,
          core.identities,
          env.CMS_GATEWAY_SITE_ID,
          env.CMS_ADMIN_EMAIL,
      )
    : undefined;
if (gateway && env.CMS_REPOSITORY_URL && env.ULVIA_PROVIDER_PUBLIC_URL && env.ULVIA_PROVIDER_TOKEN) {
    const providerSource = new HttpProviderRepository("local-bootstrap", env.CMS_REPOSITORY_URL);
    const management = new ProviderManagement(gateway, core.secrets, {
        sources: [providerSource],
        readReport: fetchProviderReport,
    });
    try {
        await bootstrapOfficialResources({
            management,
            collections: core.collections,
            repositoryUrl: env.CMS_REPOSITORY_URL,
            providerEndpoint: env.ULVIA_PROVIDER_PUBLIC_URL,
            providerToken: env.ULVIA_PROVIDER_TOKEN,
            providerSource,
        });
    } catch (error) {
        await core.close();
        throw error;
    }
}
let kernel;
try {
    kernel = await mountProductionKernel({
        env,
        core,
        authentication,
        ...(gateway ? { gateway } : {}),
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
