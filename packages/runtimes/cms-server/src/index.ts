import { createProductionAuth } from "./runtime/auth";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { createProductionGateway } from "./runtime/gateway/createProductionGateway";
import { validateCmsStorageRoots } from "./runtime/stores/storageRoots";
import { readRuntimeEnv } from "./runtimeEnv";
import { dirname, join } from "node:path";
import { ProviderManagement } from "./runtime/gateway/ProviderManagement";
import { bootstrapLocalOfficialResources } from "./runtime/gateway/bootstrapLocalOfficialResources";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";

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
          env.CMS_PROVIDER_MEDIA_DIR ?? join(dirname(env.CMS_FILES_DIR), "cms-provider-media"),
      )
    : undefined;
if (gateway && env.CMS_REPOSITORY_URL && env.CMS_LOCAL_PROVIDER_ENDPOINT && env.CMS_LOCAL_PROVIDER_ACCESS_TOKEN) {
    const providerSource = new HttpProviderRepository("local-bootstrap", env.CMS_REPOSITORY_URL);
    await bootstrapLocalOfficialResources({
        management: new ProviderManagement(gateway, core.secrets, [providerSource]),
        collections: core.collections,
        repositoryUrl: env.CMS_REPOSITORY_URL,
        providerEndpoint: env.CMS_LOCAL_PROVIDER_ENDPOINT,
        providerToken: env.CMS_LOCAL_PROVIDER_ACCESS_TOKEN,
        providerSource,
    });
}
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
