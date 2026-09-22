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
import type { DashboardAssignmentRepository } from "@bernouy/cms-dashboards";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { IdentityService } from "@bernouy/cms-identities";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { SourceEndpointInterceptor, SourceRepository, SourceRequestTelemetryOptions } from "@bernouy/cms-sources";
import type { Cache, Runner } from "@bernouy/http-runner";

type Configuration = {
    deliveryUrl?: string;
    analyticsCompliance?: AnalyticsComplianceContext;
    publicAuth?: PublicAuthRoutesConfig;
};

export type ControlCmsOptions = Configuration & {
    dashboardAssignments?: DashboardAssignmentRepository;
    identities?: IdentityService;
    endpointPerformanceReports?: EndpointPerformanceReports;
    sourceTelemetry?: SourceRequestTelemetryOptions;
    /** Shared post-authorization interceptor for bounded Source image variants. */
    sourceImageInterceptor?: SourceEndpointInterceptor;
    /** Enables explicitly public responsive consumers when the interceptor is configured. Defaults to true. */
    responsivePublicSourceImagesEnabled?: boolean;
    /** Enables private and unclassified responsive consumers when the interceptor is configured. Defaults to true. */
    responsivePrivateSourceImagesEnabled?: boolean;
};

export type ControlAuthBackends = {
    local?: LocalAuthentication;
    oidc?: OidcAuthentication;
};

export type ControlCmsState = {
    configuration: ControlCmsOptions;
    runner: Runner;
    repository: CmsRepository;
    auth: Authentication;
    cache: Cache;
    secrets: SecretStore;
    filesMetadata: CmsFilesMetadataRepository | null;
    filesBlob: CmsFilesBlobStore | null;
    users: UsersRepository | null;
    identityProviders: IdentityProviderRepository | null;
    pats: PatRepository | null;
    credentials: LocalCredentialStore | null;
    sources: SourceRepository | null;
    analytics: AnalyticsStore | null;
    dashboardAssignments: DashboardAssignmentRepository;
    identities: IdentityService;
};
