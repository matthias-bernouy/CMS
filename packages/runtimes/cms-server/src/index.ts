import { createProductionAuth } from "./runtime/auth";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";
import { dirname, join } from "node:path";

const env = readRuntimeEnv(process.env);
await validateCmsStorageRoots(env.CMS_FILES_DIR);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db, core.migrationStorage);
for (const participant of features.migrationParticipants) {
    core.collectionMigrations.addParticipant(participant);
}
const authentication = await createProductionAuth(env, core);
const gateway = env.CMS_GATEWAY_SITE_ID
    ? await createProductionGateway(
          core.db,
          core.secrets,
          core.credentials,
          features.identities,
          env.CMS_GATEWAY_SITE_ID,
          env.CMS_ADMIN_EMAIL,
          env.CMS_PROVIDER_MEDIA_DIR ?? join(dirname(env.CMS_FILES_DIR), "cms-provider-media"),
      )
    : undefined;

const surfaces = await mountProductionSurfaces({
    env,
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
