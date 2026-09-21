import { createSecretResolver } from "@bernouy/cms-secrets";
import { SourceOverlaySourceRepository } from "@bernouy/cms-sources";
import type { ControlCmsState } from "./types";

export const controlCmsAccessors = {
    config: (state: ControlCmsState) => state.configuration,
    repository: (state: ControlCmsState) => state.repository,
    auth: (state: ControlCmsState) => state.auth,
    runner: (state: ControlCmsState) => state.runner,
    cache: (state: ControlCmsState) => state.cache,
    secrets: (state: ControlCmsState) => state.secrets,
    editorDataSources: (state: ControlCmsState) => state.configuration.editorDataSources ?? [],
    dashboards: (state: ControlCmsState) => state.dashboards,
    dashboardViews: (state: ControlCmsState) => state.dashboardViews,
    dashboardAssignments: (state: ControlCmsState) => state.dashboardAssignments,
    relations: (state: ControlCmsState) => state.relations,
    identities: (state: ControlCmsState) => state.identities,
    sourceOverlays: (state: ControlCmsState) => state.sourceOverlays,
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
    optionalSources: effectiveSources,
    sources: (state: ControlCmsState) => required(effectiveSources(state), "sources repository not configured"),
    analytics: (state: ControlCmsState) => required(state.analytics, "analytics store not configured"),
    basePath: (state: ControlCmsState) => (state.runner.basePath === "/" ? "" : state.runner.basePath),
    getCspExtras: async (state: ControlCmsState) => {
        const settings = await state.repository.getSystem();
        return {
            connectExtras: [...settings.security.connectExtras],
            mediaExtras: [...settings.security.mediaExtras],
            styleExtras: [],
            scriptExtras: [],
            frameExtras: [],
        };
    },
};

function effectiveSources(state: ControlCmsState) {
    if (!state.sources) {
        return null;
    }
    const overlays = state.sourceOverlays
        ? new SourceOverlaySourceRepository(state.sources, state.sourceOverlays, {
              deps: controlCmsAccessors.sourceExecutorDeps(state),
          })
        : state.sources;
    return overlays;
}

function required<T>(value: T, message: string): NonNullable<T> {
    if (!value) {
        throw new Error(message);
    }
    return value;
}
