import { createProductionAuth } from "./runtime/auth";
import { createProductionIntegrationServices } from "./runtime/integrations";
import { mountProductionSurfaces } from "./runtime/mountSurfaces";
import { createCoreStores } from "./runtime/stores/core";
import { createFeatureStores } from "./runtime/stores/features";
import { readRuntimeEnv } from "./runtimeEnv";

const env = readRuntimeEnv(process.env);

const core = await createCoreStores(env);
const features = await createFeatureStores(core.db, core.secrets);
const integrations = createProductionIntegrationServices({
    providerRepository: features.integrationConnectorProviders,
    secrets: core.secrets,
    localRepositoryUrl: `http://127.0.0.1:${env.CONTROL_PORT}/.cms/repository`,
    environment: process.env,
});
const authentication = await createProductionAuth(env, core);

await mountProductionSurfaces({
    env,
    analyticsVisitorSecret: env.ANALYTICS_SALT_SECRET,
    core,
    features,
    integrations,
    authentication,
});
