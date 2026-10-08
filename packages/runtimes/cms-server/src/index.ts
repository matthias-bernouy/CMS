import { createProductionAuth } from "./runtime/auth";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import { bootstrapLocalOfficialResources } from "./runtime/gateway/bootstrapLocalOfficialResources";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { startLocalCoreProvider, type LocalCoreProviderHandle } from "./runtime/localCoreProvider";
import { fetchProviderReport } from "./runtime/gateway/fetchProviderReport";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db);
const authentication = await createProductionAuth(env, core);
const gateway = env.CMS_GATEWAY_SITE_ID
    ? await createProductionGateway(
          core.db,
          core.secrets,
          core.credentials,
          features.identities,
          env.CMS_GATEWAY_SITE_ID,
          env.CMS_ADMIN_EMAIL,
      )
    : undefined;
let localCoreProvider: LocalCoreProviderHandle | undefined;
if (gateway && env.CMS_REPOSITORY_URL && env.CORE_PUBLIC_URL && env.CMS_CORE_PROVIDER_TOKEN) {
    const providerSource = new HttpProviderRepository("local-bootstrap", env.CMS_REPOSITORY_URL);
    const management = new ProviderManagement(gateway, core.secrets, {
        sources: [providerSource],
        readReport: fetchProviderReport,
    });
    try {
        await bootstrapLocalOfficialResources({
            management,
            collections: core.collections,
            repositoryUrl: env.CMS_REPOSITORY_URL,
            providerEndpoint: env.CORE_PUBLIC_URL,
            providerToken: env.CMS_CORE_PROVIDER_TOKEN,
            providerSource,
            onManifestImported: async ({ version }) => {
                localCoreProvider = await startLocalCoreProvider({
                    env,
                    core,
                    gateway,
                    management,
                    manifestVersion: version,
                });
            },
        });
    } catch (error) {
        await localCoreProvider?.stop();
        await core.close();
        throw error;
    }
}
let surfaces;
try {
    surfaces = await mountProductionSurfaces({
        env,
        core,
        authentication,
        ...(gateway ? { gateway } : {}),
    });
} catch (error) {
    await localCoreProvider?.stop();
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
        await surfaces.stop();
        await localCoreProvider?.stop();
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
