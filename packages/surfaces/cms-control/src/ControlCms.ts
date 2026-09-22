import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    PublicAuthRoutesConfig,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { SourceRepository } from "@bernouy/cms-sources";
import { join } from "node:path";
import { controlCmsAccessors } from "cms-control/core/admin/control/accessors";
import { mountControlCmsRoutes } from "cms-control/core/admin/control/mountRoutes";
import { createControlCmsState } from "cms-control/core/admin/control/state";
import type { ControlAuthBackends, ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";

export type { ControlAuthBackends, ControlCmsOptions } from "cms-control/core/admin/control/types";

export class ControlCms {
    readonly ready: Promise<void>;
    private readonly state: ControlCmsState;

    constructor(
        runner: Runner,
        repository: CmsRepository,
        auth: Authentication,
        configuration: ControlCmsOptions = {},
        cache?: Cache,
        secrets?: SecretStore,
        filesMetadata?: CmsFilesMetadataRepository,
        filesBlob?: CmsFilesBlobStore,
        users?: UsersRepository,
        identityProviders?: IdentityProviderRepository,
        pats?: PatRepository,
        credentials?: LocalCredentialStore,
        sources?: SourceRepository,
        analytics?: AnalyticsStore,
        authBackends: ControlAuthBackends = {},
    ) {
        const state = createControlCmsState({
            configuration,
            runner,
            repository,
            auth,
            cache,
            secrets,
            filesMetadata,
            filesBlob,
            users,
            identityProviders,
            pats,
            credentials,
            sources,
            analytics,
            authBackends,
        });
        this.state = state;
        this.ready = mountControlCmsRoutes(this, state, authBackends, join(__dirname, "./api"));
    }

    get config() {
        return controlCmsAccessors.config(this.state);
    }
    get repository() {
        return controlCmsAccessors.repository(this.state);
    }
    get auth() {
        return controlCmsAccessors.auth(this.state);
    }
    get runner() {
        return controlCmsAccessors.runner(this.state);
    }
    get cache() {
        return controlCmsAccessors.cache(this.state);
    }
    get secrets() {
        return controlCmsAccessors.secrets(this.state);
    }
    get editorDataSources() {
        return controlCmsAccessors.editorDataSources(this.state);
    }
    get dashboards() {
        return controlCmsAccessors.dashboards(this.state);
    }
    get dashboardViews() {
        return controlCmsAccessors.dashboardViews(this.state);
    }
    get dashboardAssignments() {
        return controlCmsAccessors.dashboardAssignments(this.state);
    }
    get identities() {
        return controlCmsAccessors.identities(this.state);
    }
    get sourceOverlays() {
        return controlCmsAccessors.sourceOverlays(this.state);
    }
    get sourceExecutorDeps() {
        return controlCmsAccessors.sourceExecutorDeps(this.state);
    }
    get filesMetadata() {
        return controlCmsAccessors.filesMetadata(this.state);
    }
    get filesBlob() {
        return controlCmsAccessors.filesBlob(this.state);
    }
    get users() {
        return controlCmsAccessors.users(this.state);
    }
    get identityProviders() {
        return controlCmsAccessors.identityProviders(this.state);
    }
    get pats() {
        return controlCmsAccessors.pats(this.state);
    }
    get credentials() {
        return controlCmsAccessors.credentials(this.state);
    }
    get publicAuth() {
        return controlCmsAccessors.publicAuth(this.state);
    }
    get sources() {
        return controlCmsAccessors.sources(this.state);
    }
    get optionalSources() {
        return controlCmsAccessors.optionalSources(this.state);
    }
    get analytics() {
        return controlCmsAccessors.analytics(this.state);
    }
    get basePath() {
        return controlCmsAccessors.basePath(this.state);
    }

    async getCspExtras() {
        return controlCmsAccessors.getCspExtras(this.state);
    }
}
