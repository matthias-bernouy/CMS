import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content";
import type { BlobStore } from "@bernouy/blob-store";
import { InMemoryDashboardAssignmentRepository, InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryIdentityService } from "@bernouy/cms-gateway/identity";
import {
    InMemoryCmsFileMutationJournal,
    type CmsFileMutationJournal,
    type CmsFilesMetadataRepository,
} from "@bernouy/cms-content/files";
import { InMemoryCache, type Cache, type Runner } from "@bernouy/http-runner";
import { InMemorySecretStore, type SecretStore, ValidatingSecretStore } from "@bernouy/secret-store";
import type { ControlAuthBackends, ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";

export type ControlCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    configuration: ControlCmsOptions;
    cache?: Cache;
    secrets?: SecretStore;
    filesMetadata?: CmsFilesMetadataRepository;
    filesBlob?: BlobStore;
    fileMutations?: CmsFileMutationJournal;
    users?: UsersRepository;
    identityProviders?: IdentityProviderRepository;
    pats?: PatRepository;
    credentials?: LocalCredentialStore;
    authBackends: ControlAuthBackends;
};

export function createControlCmsState(input: ControlCmsConstructorInput): ControlCmsState {
    const configuration = input.configuration;
    return {
        configuration,
        runner: input.runner,
        repository: input.repository,
        auth: input.auth,
        cache: input.cache || new InMemoryCache(),
        secrets: input.secrets || new ValidatingSecretStore(new InMemorySecretStore()),
        filesMetadata: input.filesMetadata ?? null,
        filesBlob: input.filesBlob ?? null,
        fileMutations:
            input.fileMutations ??
            (input.filesMetadata && input.filesBlob ? new InMemoryCmsFileMutationJournal() : null),
        users: input.users ?? null,
        identityProviders: input.identityProviders ?? null,
        pats: input.pats ?? null,
        credentials: input.credentials ?? null,
        dashboardAssignments: configuration.dashboardAssignments ?? new InMemoryDashboardAssignmentRepository(),
        dashboards: configuration.dashboards ?? new InMemoryDashboardRepository(),
        identities: configuration.identities ?? new InMemoryIdentityService(),
    };
}
