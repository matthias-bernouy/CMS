import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { SecretStore } from "@bernouy/cms-secrets";
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
    get dashboardAssignments() {
        return controlCmsAccessors.dashboardAssignments(this.state);
    }
    get identities() {
        return controlCmsAccessors.identities(this.state);
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
    get publicAuth(): PublicAuthRoutesConfig & {
        emailTest?: { send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> };
    } {
        return controlCmsAccessors.publicAuth(this.state);
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
