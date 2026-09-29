import type {
    Authentication,
    IdentityProviderRepository,
    LocalAuthenticationActions,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
    Subject,
} from "@bernouy/cms-auth";
import type { PublicAuthRoutesConfig, OidcAuthHandlers } from "@bernouy/cms-auth/http";
import type { AnalyticsComplianceContext, AnalyticsStore, EndpointPerformanceReports } from "@bernouy/cms-analytics";
import type { CmsRepository } from "@bernouy/cms-content";
import type { DashboardAssignmentRepository } from "@bernouy/cms-dashboards";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { ProviderImageService } from "@bernouy/cms-gateway/media";
import type { SecretStore } from "@bernouy/cms-secrets";
import type { SourceEndpointInterceptor, SourceRepository, SourceRequestTelemetryOptions } from "@bernouy/cms-sources";
import type { Cache, Runner } from "@bernouy/http-runner";

type Configuration = {
    deliveryUrl?: string;
    analyticsCompliance?: AnalyticsComplianceContext;
    publicAuth?: PublicAuthRoutesConfig & {
        emailTest?: { send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> };
    };
};

export type ControlCmsOptions = Configuration & {
    dashboardAssignments?: DashboardAssignmentRepository;
    identities?: IdentityService;
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly images?: Pick<ProviderImageService, "get">;
        /** Host-owned verified administrator grant, independent of request fields. */
        readonly isAdministrator: (subject: Subject) => Promise<boolean>;
    };
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
    local?: LocalAuthenticationActions;
    oidc?: OidcAuthHandlers;
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
