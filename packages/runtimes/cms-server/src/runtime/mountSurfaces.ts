import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import type { RuntimeEnv } from "../runtimeEnv";
import { startProductionSystemFunctionWorkers } from "../systemFunctionWorkers";
import type { ProductionAuthentication } from "./auth";
import type { ProductionIntegrationServices } from "./integrations";
import type { CoreStores } from "./stores/core";
import type { FeatureStores } from "./stores/features";

type MountOptions = {
    env: RuntimeEnv;
    analyticsSalt: string;
    core: CoreStores;
    features: FeatureStores;
    integrations: ProductionIntegrationServices;
    authentication: ProductionAuthentication;
};

export async function mountProductionSurfaces(options: MountOptions): Promise<void> {
    const { env, core, features, integrations, authentication } = options;
    const controlRunner = new BunRunner();
    controlRunner.group("/.cms/repository", (repositoryRunner) => {
        new RepositoryCms({
            runner: repositoryRunner,
            integrationCatalog: integrations.integrationRepositoryCatalog,
        });
    });
    const controlCms = new ControlCms(
        controlRunner,
        core.repo,
        authentication.auth,
        {
            deliveryUrl: env.DELIVERY_PUBLIC_URL,
            integrationCatalog: integrations.integrationCatalog,
            integrationInstallations: features.integrationInstallations,
            integrationConnectorProviders: features.integrationConnectorProviders,
            integrationConnectorDeployers: integrations.integrationConnectorDeployers,
            dashboards: features.dashboards,
            relations: features.relations,
            functions: features.functions,
            triggers: features.triggers,
            identities: features.identities,
            sourceOverlays: features.sourceOverlays,
            publicAuth: {
                ...authentication.publicAuthBase,
                emailVerificationUrl: env.CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL,
                passwordResetUrl: env.CMS_CONTROL_AUTH_PASSWORD_RESET_URL,
                allowSignup: false,
            },
        },
        core.cache,
        core.secrets,
        core.filesMetadata,
        core.filesBlob,
        core.users,
        core.identityProviders,
        core.pats,
        core.credentials,
        features.sources,
        features.analytics,
        core.roles,
        { local: authentication.auth },
    );
    await controlCms.ready;

    const deliveryRunner = new BunRunner();
    new DeliveryCms({
        runner: deliveryRunner,
        repository: core.repo,
        cache: core.cache,
        sources: features.deliverySources,
        analytics: features.analytics,
        functions: features.functions,
        triggers: features.triggers,
        identities: features.identities,
        integrationInstallations: features.integrationInstallations,
        analyticsSalt: options.analyticsSalt,
        sourceResolveSecret: features.resolveSecret,
        roles: core.roles,
        filesMetadata: core.filesMetadata,
        filesBlob: core.filesBlob,
        variantStore: core.variantStore,
        auth: {
            ...authentication.publicAuthBase,
            emailVerificationUrl: env.CMS_AUTH_EMAIL_VERIFICATION_URL,
            passwordResetUrl: env.CMS_AUTH_PASSWORD_RESET_URL,
        },
    });

    startProductionSystemFunctionWorkers({
        functions: features.functions,
        sources: features.deliverySources,
        deps: { resolveSecret: features.resolveSecret, identities: features.identities },
    });

    controlRunner.start(env.CONTROL_PORT);
    deliveryRunner.start(env.DELIVERY_PORT);
    console.log("🚀 CMS listening");
    console.log(`   admin:        ${env.CONTROL_PUBLIC_URL}/admin/`);
    console.log(`   sign in:      ${env.CONTROL_PUBLIC_URL}/login`);
    console.log(`   public site:  ${env.DELIVERY_PUBLIC_URL}/`);
    console.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
}
