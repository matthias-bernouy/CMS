import { withFunctionsSource } from "@bernouy/cms-functions";
import { collectIntegrationInstallationCspExtras } from "@bernouy/cms-integrations";
import { createSecretResolver } from "@bernouy/cms-secrets";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import { mergeUnique } from "./defaults";
import type { ControlCmsState } from "./types";

export const controlCmsAccessors = {
    config: (state: ControlCmsState) => state.configuration,
    repository: (state: ControlCmsState) => state.repository,
    auth: (state: ControlCmsState) => state.auth,
    runner: (state: ControlCmsState) => state.runner,
    cache: (state: ControlCmsState) => state.cache,
    secrets: (state: ControlCmsState) => state.secrets,
    roles: (state: ControlCmsState) => state.roles,
    integrationCatalog: (state: ControlCmsState) => state.integrationCatalog,
    integrationPackageResolver: (state: ControlCmsState) => state.integrationPackageResolver,
    integrationUpgradeReleases: (state: ControlCmsState) => state.configuration.integrationUpgradeReleases,
    dashboards: (state: ControlCmsState) => state.dashboards,
    relations: (state: ControlCmsState) => state.relations,
    functions: (state: ControlCmsState) => state.functions,
    triggers: (state: ControlCmsState) => state.triggers,
    identities: (state: ControlCmsState) => state.identities,
    sourceOverlays: (state: ControlCmsState) => state.sourceOverlays,
    configuredIntegrationInstallations: (state: ControlCmsState) => state.integrationInstallations,
    integrationConnectorDeployers: (state: ControlCmsState) => state.configuration.integrationConnectorDeployers,
    integrationMigrationRuntime: (state: ControlCmsState) => state.configuration.integrationMigrationRuntime,
    integrationConnectorBaselineAdopters: (state: ControlCmsState) =>
        state.configuration.integrationConnectorBaselineAdopters ?? [],
    integrationProvisioners: (state: ControlCmsState) => state.configuration.integrationProvisioners,
    integrationConnectorProviders: (state: ControlCmsState) => state.integrationConnectorProviders,
    integrationBlocRepository: (state: ControlCmsState) => state.integrationBlocRepository,
    sourceExecutorDeps: (state: ControlCmsState) => ({
        resolveSecret: createSecretResolver(state.secrets),
        identities: state.identities,
    }),
    filesMetadata: (state: ControlCmsState) => required(state.filesMetadata, "files metadata backend not configured"),
    filesBlob: (state: ControlCmsState) => required(state.filesBlob, "files blob backend not configured"),
    users: (state: ControlCmsState) => required(state.users, "users repository not configured"),
    identityProviders: (state: ControlCmsState) =>
        required(state.identityProviders, "identity providers repository not configured"),
    pats: (state: ControlCmsState) => required(state.pats, "PAT repository not configured"),
    credentials: (state: ControlCmsState) => required(state.credentials, "local credential store not configured"),
    publicAuth: (state: ControlCmsState) => required(state.configuration.publicAuth, "public auth not configured"),
    integrationInstallations: (state: ControlCmsState) =>
        required(state.integrationInstallations, "integration installations repository not configured"),
    sources: (state: ControlCmsState) => {
        const sources = required(state.sources, "sources repository not configured");
        const overlays = state.sourceOverlays
            ? new SourceOverlaySourceRepository(sources, state.sourceOverlays, {
                  deps: controlCmsAccessors.sourceExecutorDeps(state),
              })
            : sources;
        return state.functions ? withFunctionsSource(overlays, state.functions) : overlays;
    },
    analytics: (state: ControlCmsState) => required(state.analytics, "analytics store not configured"),
    basePath: (state: ControlCmsState) => (state.runner.basePath === "/" ? "" : state.runner.basePath),
    getCspExtras: async (state: ControlCmsState) => {
        const settings = await state.repository.getSystem();
        const integrationCsp = state.integrationInstallations
            ? collectIntegrationInstallationCspExtras(await state.integrationInstallations.list())
            : null;
        return {
            connectExtras: mergeUnique(settings.security.connectExtras, integrationCsp?.connectExtras),
            mediaExtras: mergeUnique(settings.security.mediaExtras, integrationCsp?.mediaExtras),
            styleExtras: mergeUnique([], integrationCsp?.styleExtras),
            scriptExtras: mergeUnique([], integrationCsp?.scriptExtras),
            frameExtras: mergeUnique([], integrationCsp?.frameExtras),
        };
    },
};

function required<T>(value: T, message: string): NonNullable<T> {
    if (!value) {
        throw new Error(message);
    }
    return value;
}
