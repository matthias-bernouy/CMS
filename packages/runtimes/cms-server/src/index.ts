import { createProductionAuth } from "./runtime/auth";
import { SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY } from "@bernouy/cms-integrations";
import { createProductionIntegrationServices } from "./runtime/integrations";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createIntegrationPackageCacheObserver } from "./runtime/sourceTelemetry";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";
import { createProductionRepositoryManagementGateway } from "./runtime/repository";

const env = readRuntimeEnv(process.env);
const repositoryManagementGateway = await createProductionRepositoryManagementGateway(env.repositoryManagementGateway);
await validateCmsStorageRoots(env.CMS_FILES_DIR, env.CMS_INTEGRATION_PACKAGE_CACHE_DIR);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db, core.secrets, {
    endpointPerformanceEnabled: env.ENDPOINT_PERFORMANCE_ENABLED,
    ...(env.localSupabase
        ? { sourceTargetValidation: { allowBlockedTargetUrlPrefixes: [env.localSupabase.functionsBaseUrl] } }
        : {}),
});
if (env.localSupabase) {
    await features.integrationConnectorProviders.upsert({
        provider: "supabase",
        enabled: true,
        projectRef: env.localSupabase.projectRef,
    });
    await core.secrets.set(SUPABASE_CONNECTOR_ACCESS_TOKEN_SECRET_KEY, env.localSupabase.accessToken);
}
const integrations = createProductionIntegrationServices({
    providerRepository: features.integrationConnectorProviders,
    secrets: core.secrets,
    repository: env.integrationRepository,
    packageCacheDir: env.CMS_INTEGRATION_PACKAGE_CACHE_DIR,
    packageCacheObserve: createIntegrationPackageCacheObserver(),
    environment: process.env,
    ...(env.localSupabase
        ? {
              supabase: {
                  apiBaseUrl: env.localSupabase.managementApiUrl,
                  functionsBaseUrl: env.localSupabase.functionsBaseUrl,
              },
          }
        : {}),
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
    ...(repositoryManagementGateway ? { repositoryManagementGateway } : {}),
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
