import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
import { startAnalyticsFinalizer } from "@bernouy/cms-analytics";
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
    analyticsVisitorSecret: string;
    core: CoreStores;
    features: FeatureStores;
    integrations: ProductionIntegrationServices;
    authentication: ProductionAuthentication;
};

export type ProductionSurfaceRuntime = {
    Runner: typeof BunRunner;
    Control: typeof ControlCms;
    Delivery: typeof DeliveryCms;
    Repository: typeof RepositoryCms;
    startWorkers: typeof startProductionSystemFunctionWorkers;
    startAnalyticsFinalizer: typeof startAnalyticsFinalizer;
    log: (message: string) => void;
};

const PRODUCTION_SURFACE_RUNTIME: ProductionSurfaceRuntime = {
    Runner: BunRunner,
    Control: ControlCms,
    Delivery: DeliveryCms,
    Repository: RepositoryCms,
    startWorkers: startProductionSystemFunctionWorkers,
    startAnalyticsFinalizer,
    log: console.log,
};

export async function mountProductionSurfaces(
    options: MountOptions,
    runtime: ProductionSurfaceRuntime = PRODUCTION_SURFACE_RUNTIME,
): Promise<void> {
    const { env, core, features, integrations, authentication } = options;
    const controlRunner = new runtime.Runner();
    controlRunner.group("/.cms/repository", (repositoryRunner) => {
        new runtime.Repository({
            runner: repositoryRunner,
            integrationCatalog: integrations.integrationRepositoryCatalog,
        });
    });
    const controlCms = new runtime.Control(
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

    const deliveryRunner = new runtime.Runner();
    new runtime.Delivery({
        runner: deliveryRunner,
        repository: core.repo,
        cache: core.cache,
        sources: features.deliverySources,
        analytics: features.analytics,
        functions: features.functions,
        triggers: features.triggers,
        identities: features.identities,
        integrationInstallations: features.integrationInstallations,
        analyticsVisitorSecret: options.analyticsVisitorSecret,
        analyticsSiteScope: env.DELIVERY_PUBLIC_URL,
        analyticsTrustProxy: env.ANALYTICS_TRUST_PROXY,
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

    runtime.startWorkers({
        functions: features.functions,
        sources: features.deliverySources,
        deps: { resolveSecret: features.resolveSecret, identities: features.identities },
    });
    runtime.startAnalyticsFinalizer(features.analytics, {
        onError: (error) => console.error("Analytics visitor finalization failed:", error),
    });

    controlRunner.start(env.CONTROL_PORT);
    deliveryRunner.start(env.DELIVERY_PORT);
    runtime.log("🚀 CMS listening");
    runtime.log(`   admin:        ${env.CONTROL_PUBLIC_URL}/admin/`);
    runtime.log(`   sign in:      ${env.CONTROL_PUBLIC_URL}/login`);
    runtime.log(`   public site:  ${env.DELIVERY_PUBLIC_URL}/`);
    runtime.log(`   storage:      mongo=${core.db.databaseName}, files=${env.CMS_FILES_DIR}`);
}
