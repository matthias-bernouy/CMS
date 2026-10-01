import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
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
import type { CmsRepository } from "@bernouy/cms-content";
import type { DashboardAssignmentRepository, DashboardRepository } from "@bernouy/cms-dashboards";
import type { CmsFilesBlobStore, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { IdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import type { GatewayCapabilityCatalogue } from "@bernouy/cms-gateway";
import type { ProviderImageService } from "@bernouy/cms-gateway/media";
import type { SecretStore } from "@bernouy/secret-store";
import type { Cache, Runner } from "@bernouy/http-runner";

type Configuration = {
    deliveryUrl?: string;
    publicAuth?: PublicAuthRoutesConfig & {
        emailTest?: { send(input: { kind: "email_verification" | "password_reset"; to: string }): Promise<void> };
    };
};

export type ControlCmsOptions = Configuration & {
    administrator?: (subject: Subject) => Promise<boolean>;
    administrators?: {
        canRevoke(sub: string): Promise<boolean>;
        list(): Promise<string[]>;
        set(sub: string, enabled: boolean): Promise<void>;
    };
    collections?: { store: CollectionStore; siteId: string; sources?: readonly CollectionRepositorySource[] };
    providerResources?: {
        sources: readonly ProviderRepositorySource[];
        contracts: ReleaseCatalogue;
        manifests: ProviderManifestCatalogue;
        isAdministrator: (subject: Subject) => Promise<boolean>;
        management?: {
            list(): Promise<unknown>;
            importManifest(manifest: string): Promise<unknown>;
            preview(
                input: {
                    providerId: string;
                    version: string;
                    endpoint: string;
                    token: string;
                    installationId?: string;
                    revision?: number;
                },
                actorId: string,
            ): Promise<unknown>;
            approve(ticket: string, actorId: string): Promise<unknown>;
            setStatus(input: {
                installationId: string;
                revision: number;
                action: "enable" | "disable" | "revoke";
            }): Promise<unknown>;
            selectContract(input: {
                installationId: string;
                contractId: string;
                version: string;
                digest: string;
            }): Promise<unknown>;
        };
    };
    dashboardAssignments?: DashboardAssignmentRepository;
    dashboards?: DashboardRepository;
    identities?: IdentityService;
    capabilityGateway?: {
        readonly siteId: string;
        readonly invoker: GatewayInvoker;
        readonly images?: Pick<ProviderImageService, "get">;
        readonly catalogue?: GatewayCapabilityCatalogue;
        /** Host-owned verified administrator grant, independent of request fields. */
        readonly isAdministrator: (subject: Subject) => Promise<boolean>;
    };
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
    dashboardAssignments: DashboardAssignmentRepository;
    dashboards: DashboardRepository;
    identities: IdentityService;
};
