import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { PublicAuthRoutesConfig } from "@bernouy/cms-auth/http";
import type { BlobStore } from "@bernouy/blob-store";
import type { CmsRepository } from "@bernouy/cms-content";
import type { CmsFileMutationJournal, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { SecretStore } from "@bernouy/secret-store";
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
        filesBlob?: BlobStore,
        users?: UsersRepository,
        identityProviders?: IdentityProviderRepository,
        pats?: PatRepository,
        credentials?: LocalCredentialStore,
        authBackends: ControlAuthBackends = {},
        fileMutations?: CmsFileMutationJournal,
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
            authBackends,
            fileMutations,
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
    get identities() {
        return controlCmsAccessors.identities(this.state);
    }
    get filesMetadata() {
        return controlCmsAccessors.filesMetadata(this.state);
    }
    get filesBlob() {
        return controlCmsAccessors.filesBlob(this.state);
    }
    get fileMutations() {
        return controlCmsAccessors.fileMutations(this.state);
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
    get basePath() {
        return controlCmsAccessors.basePath(this.state);
    }

    async getCspExtras() {
        return controlCmsAccessors.getCspExtras(this.state);
    }
}
