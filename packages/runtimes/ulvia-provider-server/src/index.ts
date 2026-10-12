import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import { importOfficialManifest } from "./runtime/importOfficialManifest";
import { createProviderGateway } from "./runtime/gateway/createProviderGateway";
import { fetchProviderReport } from "./runtime/gateway/fetchProviderReport";
import { mountUlviaProvider, type UlviaProviderServerHandle } from "./runtime/mountUlviaProvider";
import { MongoProviderOperationStore } from "./runtime/provider-operations/MongoProviderOperationStore";
import { createProviderStores } from "./runtime/stores/providerStores";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readProviderRuntimeEnv } from "./runtimeEnv";

const env = readProviderRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createProviderStores(env);
let provider: UlviaProviderServerHandle;
try {
    const gateway = await createProviderGateway(core, env.CMS_GATEWAY_SITE_ID, env.CMS_ADMIN_EMAIL);
    const source = new HttpProviderRepository("ulvia-provider-bootstrap", env.CMS_REPOSITORY_URL);
    const management = new ProviderManagement(gateway, core.secrets, {
        sources: [source],
        readReport: fetchProviderReport,
    });
    const manifestVersion = await importOfficialManifest(management, source);
    const providerOperations = new MongoProviderOperationStore(core.db);
    await providerOperations.init();
    provider = await mountUlviaProvider({
        env,
        stores: core,
        gateway,
        management,
        providerOperations,
        manifestVersion,
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
    console.log(`\n→ Stopping Ulvia Provider (${signal})...`);
    try {
        await provider.stop();
    } finally {
        await core.close();
    }
};
const handleSignal = (signal: string): void => {
    void shutdown(signal).catch((error) => {
        console.error("Ulvia Provider shutdown failed", error);
        process.exitCode = 1;
    });
};
process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));
