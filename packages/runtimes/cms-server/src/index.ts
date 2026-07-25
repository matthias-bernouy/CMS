import { createProductionAuth } from "./runtime/auth";
import { createProductionIntegrationServices } from "./runtime/integrations";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR, env.CMS_INTEGRATION_PACKAGE_CACHE_DIR);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db, core.secrets, {
    endpointPerformanceEnabled: env.ENDPOINT_PERFORMANCE_ENABLED,
});
const integrations = createProductionIntegrationServices({
    providerRepository: features.integrationConnectorProviders,
    secrets: core.secrets,
    localRepositoryUrl: `http://127.0.0.1:${env.DELIVERY_PORT}/.cms/repository`,
    packageCacheDir: env.CMS_INTEGRATION_PACKAGE_CACHE_DIR,
    environment: process.env,
});
await integrations.integrationPackageCache.init();
const authentication = await createProductionAuth(env, core);

const scheduledTriggers = await mountProductionSurfaces({
    env,
    analyticsVisitorSecret: env.ANALYTICS_SALT_SECRET,
    core,
    features,
    integrations,
    authentication,
});

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\n→ Stopping (${signal})...`);
    await scheduledTriggers.stop();
    process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
