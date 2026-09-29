import { createProductionAuth } from "./runtime/auth";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db, core.secrets, {
    endpointPerformanceEnabled: env.ENDPOINT_PERFORMANCE_ENABLED,
});
const authentication = await createProductionAuth(env, core);
const gateway = env.CMS_GATEWAY_SITE_ID
    ? await createProductionGateway(
          core.db,
          core.secrets,
          core.credentials,
          env.CMS_GATEWAY_SITE_ID,
          env.CMS_ADMIN_EMAIL,
      )
    : undefined;

const surfaces = await mountProductionSurfaces({
    env,
    analyticsVisitorSecret: env.ANALYTICS_SALT_SECRET,
    core,
    features,
    authentication,
    ...(gateway ? { gateway } : {}),
});

let stopping = false;
const shutdown = async (signal: string) => {
    if (stopping) {
        return;
    }
    stopping = true;
    console.log(`\n→ Stopping (${signal})...`);
    await surfaces.stop();
    process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
