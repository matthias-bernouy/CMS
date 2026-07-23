import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthentication,
    LocalCredentialStore,
    OidcAuthentication,
    PatRepository,
    PublicAuthRoutesConfig,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { AnalyticsComplianceContext, AnalyticsStore } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { IdentityService } from "@bernouy/cms-identities";
import type {
    IntegrationConnectorDeployer,
    IntegrationConnectorProviderRepository,
    IntegrationDefinitionRepository,
    IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import type { RolesRepository } from "@bernouy/cms-permissions";
import type { RelationRepository } from "@bernouy/cms-relations";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { SourceOverlayRepository, SourceRepository } from "@bernouy/cms-sources";
import type { TriggerRepository } from "@bernouy/cms-triggers";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { CMS_ROLES } from "types/roles";

type Configuration = {
    deliveryUrl?: string;
    analyticsCompliance?: AnalyticsComplianceContext;
    publicAuth?: PublicAuthRoutesConfig<CMS_ROLES>;
};

export type ControlCmsOptions = Configuration & {
    integrationCatalog?: IntegrationDefinitionRepository;
    integrationInstallations?: IntegrationInstallationRepository;
    integrationConnectorDeployers?: IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer>;
    integrationConnectorProviders?: IntegrationConnectorProviderRepository;
    dashboards?: DashboardRepository;
    relations?: RelationRepository;
    functions?: FunctionRepository;
    triggers?: TriggerRepository;
    identities?: IdentityService;
    sourceOverlays?: SourceOverlayRepository;
    integrationBlocRepository?: CmsRepository;
};

export type ControlAuthBackends = {
    local?: LocalAuthentication<CMS_ROLES>;
    oidc?: OidcAuthentication<CMS_ROLES>;
};

export type ControlCmsState = {
    configuration: ControlCmsOptions;
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication<CMS_ROLES>;
    cache: Cache;
    secrets: SecretStore;
    filesMetadata: CmsFilesMetadataRepository | null;
    filesBlob: CmsFilesBlobStore | null;
    users: UsersRepository<CMS_ROLES> | null;
    identityProviders: IdentityProviderRepository | null;
    pats: PatRepository | null;
    credentials: LocalCredentialStore | null;
    sources: SourceRepository | null;
    analytics: AnalyticsStore | null;
    roles: RolesRepository;
    integrationCatalog: IntegrationDefinitionRepository;
    integrationInstallations: IntegrationInstallationRepository | null;
    integrationConnectorProviders: IntegrationConnectorProviderRepository;
    dashboards: DashboardRepository;
    relations: RelationRepository;
    functions: FunctionRepository | null;
    triggers: TriggerRepository | null;
    identities: IdentityService;
    sourceOverlays: SourceOverlayRepository | null;
    integrationBlocRepository: CmsRepository | null;
};
