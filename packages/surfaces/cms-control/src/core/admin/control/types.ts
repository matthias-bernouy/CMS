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
import type { AnalyticsComplianceContext, AnalyticsStore, EndpointPerformanceReports } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { DashboardRepository } from "@bernouy/cms-dashboards";
import type { EditorDataSource } from "@bernouy/cms-editor-system-v2";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-files";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { IdentityService } from "@bernouy/cms-identities";
import type {
    IntegrationConnectorBaselineAdopter,
    IntegrationConnectorDeployer,
    IntegrationConnectorProviderRepository,
    IntegrationDefinitionRepository,
    IntegrationInstallationRepository,
    IntegrationPackageResolver,
    IntegrationProvisioner,
    IntegrationMigrationRuntime,
} from "@bernouy/cms-integrations";
import type { RolesRepository } from "@bernouy/cms-permissions";
import type { RelationRepository } from "@bernouy/cms-relations";
import type { SecretStore } from "@bernouy/cms-secrets";
import type {
    ExecutorDeps,
    SourceEndpointInterceptor,
    SourceOverlayRepository,
    SourceRepository,
    SourceRequestTelemetryOptions,
    SourceTargetUrlValidationOptions,
} from "@bernouy/cms-sources";
import type { ScheduledTriggerRunResult, TriggerRepository } from "@bernouy/cms-triggers";
import type { Cache, Runner } from "@bernouy/http-runner";
import type { CMS_ROLES } from "types/roles";
import type { IntegrationUpgradeReleaseReader } from "cms-control/core/management/integrations/upgrade/contracts";

type Configuration = {
    deliveryUrl?: string;
    analyticsCompliance?: AnalyticsComplianceContext;
    publicAuth?: PublicAuthRoutesConfig<CMS_ROLES>;
};

export type ControlCmsOptions = Configuration & {
    editorDataSources?: readonly EditorDataSource[];
    integrationCatalog?: IntegrationDefinitionRepository;
    integrationPackageResolver?: IntegrationPackageResolver;
    integrationUpgradeReleases?: IntegrationUpgradeReleaseReader;
    integrationInstallations?: IntegrationInstallationRepository;
    integrationConnectorDeployers?: IntegrationConnectorDeployer[] | Record<string, IntegrationConnectorDeployer>;
    integrationMigrationRuntime?: IntegrationMigrationRuntime;
    integrationConnectorBaselineAdopters?: IntegrationConnectorBaselineAdopter[];
    integrationProvisioners?: IntegrationProvisioner[] | Record<string, IntegrationProvisioner>;
    integrationConnectorProviders?: IntegrationConnectorProviderRepository;
    dashboards?: DashboardRepository;
    relations?: RelationRepository;
    functions?: FunctionRepository;
    triggers?: TriggerRepository;
    scheduledTriggers?: {
        enabled: boolean;
        runNow?: (triggerId: string) => Promise<ScheduledTriggerRunResult>;
    };
    identities?: IdentityService;
    sourceOverlays?: SourceOverlayRepository;
    endpointPerformanceReports?: EndpointPerformanceReports;
    sourceTelemetry?: SourceRequestTelemetryOptions;
    /** Shared post-authorization interceptor for bounded Source image variants. */
    sourceImageInterceptor?: SourceEndpointInterceptor;
    /** Enables explicitly public responsive consumers when the interceptor is configured. Defaults to true. */
    responsivePublicSourceImagesEnabled?: boolean;
    /** Enables private and unclassified responsive consumers when the interceptor is configured. Defaults to true. */
    responsivePrivateSourceImagesEnabled?: boolean;
    sourceTrustedConnectorTarget?: NonNullable<ExecutorDeps["isTrustedConnectorTarget"]>;
    sourceTargetValidation?: SourceTargetUrlValidationOptions;
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
    integrationPackageResolver: IntegrationPackageResolver | undefined;
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
