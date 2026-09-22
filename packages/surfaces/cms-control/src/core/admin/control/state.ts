import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import { InMemoryDashboardAssignmentRepository } from "@bernouy/cms-dashboards";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import { InMemoryCache, type Cache, type Runner } from "@bernouy/http-runner";
import { InMemorySecretStore, type SecretStore, ValidatingSecretStore } from "@bernouy/cms-secrets";
import type { SourceRepository } from "@bernouy/cms-sources";
import type { ControlAuthBackends, ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";

export type ControlCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    configuration: ControlCmsOptions;
    cache?: Cache;
    secrets?: SecretStore;
    filesMetadata?: CmsFilesMetadataRepository;
    filesBlob?: CmsFilesBlobStore;
    users?: UsersRepository;
    identityProviders?: IdentityProviderRepository;
    pats?: PatRepository;
    credentials?: LocalCredentialStore;
    sources?: SourceRepository;
    analytics?: AnalyticsStore;
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
        users: input.users ?? null,
        identityProviders: input.identityProviders ?? null,
        pats: input.pats ?? null,
        credentials: input.credentials ?? null,
        sources: input.sources ?? null,
        analytics: input.analytics ?? null,
        dashboardAssignments: configuration.dashboardAssignments ?? new InMemoryDashboardAssignmentRepository(),
        identities: configuration.identities ?? new InMemoryIdentityService(),
    };
}
