import type {
    Authentication,
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryIdentityService } from "@bernouy/cms-identities";
import { InMemoryIntegrationConnectorProviderRepository } from "@bernouy/cms-integrations";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import { InMemoryCache, type Cache, type Runner } from "@bernouy/http-runner";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemoryRolesRepository, type RolesRepository, ValidatingRolesRepository } from "@bernouy/cms-permissions";
import { InMemorySecretStore, type SecretStore, ValidatingSecretStore } from "@bernouy/cms-secrets";
import type { SourceRepository } from "@bernouy/cms-sources";
import type { CMS_ROLES } from "types/roles";
import { EMPTY_INTEGRATION_CATALOG } from "cms-control/core/admin/control/defaults";
import type { ControlAuthBackends, ControlCmsOptions, ControlCmsState } from "cms-control/core/admin/control/types";

export type ControlCmsConstructorInput = {
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication<CMS_ROLES>;
    configuration: ControlCmsOptions;
    cache?: Cache;
    secrets?: SecretStore;
    filesMetadata?: CmsFilesMetadataRepository;
    filesBlob?: CmsFilesBlobStore;
    users?: UsersRepository<CMS_ROLES>;
    identityProviders?: IdentityProviderRepository;
    pats?: PatRepository;
    credentials?: LocalCredentialStore;
    sources?: SourceRepository;
    analytics?: AnalyticsStore;
    roles?: RolesRepository;
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
        roles: input.roles ?? new ValidatingRolesRepository(new InMemoryRolesRepository()),
        integrationCatalog: configuration.integrationCatalog ?? EMPTY_INTEGRATION_CATALOG,
        integrationInstallations: configuration.integrationInstallations ?? null,
        integrationConnectorProviders:
            configuration.integrationConnectorProviders ?? new InMemoryIntegrationConnectorProviderRepository(),
        dashboards: configuration.dashboards ?? new InMemoryDashboardRepository(),
        relations: configuration.relations ?? new InMemoryRelationRepository(),
        functions: configuration.functions ?? null,
        triggers: configuration.triggers ?? null,
        identities: configuration.identities ?? new InMemoryIdentityService(),
        sourceOverlays: configuration.sourceOverlays ?? null,
        integrationBlocRepository: configuration.integrationBlocRepository ?? null,
    };
}
