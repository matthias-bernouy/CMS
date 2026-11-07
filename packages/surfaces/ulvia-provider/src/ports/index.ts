import type { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import type { CmsDocumentation } from "@bernouy/cms-documentation";
import type { ProviderMachinePreparation, PreparedProviderMachine } from "@bernouy/cms-gateway/protocol";
import type { ProviderDispatchPreparation, PreparedProviderDispatch } from "@bernouy/cms-gateway/protocol";
import type { CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { DeliveryActor, ContentDeliveryHost } from "@bernouy/cms-content/public-delivery";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderAdministration } from "./providers";
import type { RepositoryAuthoring } from "@bernouy/cms-repository/repository/authoring";
import type { McpAuthorization } from "@bernouy/cms-auth/oauth";
import type { UserDeletionStores } from "@bernouy/cms-auth/management";
import type {
    AuthenticationCredential,
    LocalCredentialStore,
    LocalLoginResult,
    PatRepository,
    PublicAuthActions,
    Subject,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionUpgradeService } from "@bernouy/cms-repository/collections/installations";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { ProviderInstallationStatus } from "@bernouy/ulvia-providers/installations";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import type { ContractSelectionStore, ContractUpgradeService } from "@bernouy/cms-repository/providers/selections";
import type { FilesServices } from "@bernouy/cms-files/feature";
export type { CmsFileWorkspace } from "@bernouy/cms-files/feature";
import type { SecretsServices } from "@bernouy/cms-secrets/feature";
import type { SmtpEmailerServices } from "@bernouy/email-smtp/feature";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";
import type { ObservabilityServices } from "@bernouy/cms-observability/feature";

export interface CmsContentDependencies {
    readonly publicDelivery?: (context: ProviderCapabilityInvocationContext) => {
        resolvePath(
            input: unknown,
            actor: DeliveryActor,
            executeQuery?: ContentDeliveryHost["executeQuery"],
            context?: { readonly headers?: HeadersInit; readonly signal?: AbortSignal },
        ): Promise<Response>;
    };
    readonly contentQuery?: (
        context: ProviderCapabilityInvocationContext,
        contractId: string,
        capabilityId: string,
        input: Readonly<Record<string, string | number>>,
    ) => Promise<Response>;
    readonly repo: ContentRepository;
    readonly collections: CollectionStore;
    readonly sitemapStore?: BlobStore;
    readonly logger?: Logger;
}

export interface CmsCollectionDependencies {
    readonly documentation?: CmsDocumentation;
    readonly repositoryDiscovery?: RepositoryDiscovery;
    readonly authoring?: RepositoryAuthoring;
    readonly collections: CollectionStore;
    readonly collectionUpgrades: CollectionUpgradeService;
}

export interface CmsAccessDependencies {
    readonly withUserDeletion?: UserDeletionStores["withUserDeletion"];
    readonly mcpAuthorization?: McpAuthorization;
    readonly users: UsersRepository;
    readonly credentials: LocalCredentialStore;
    readonly pats: PatRepository;
    readonly authentication: {
        authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult>;
        resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null>;
        revokeCredential(credential: AuthenticationCredential | undefined): Promise<void>;
        revokeSessionsForSub(sub: string): Promise<void>;
    };
    readonly accountLifecycle: Pick<
        PublicAuthActions,
        | "signup"
        | "requestEmailVerification"
        | "confirmEmailVerification"
        | "requestPasswordReset"
        | "confirmPasswordReset"
    >;
}

/** Ports supplied by the runtime for SDK feature implementations. */
export type UlviaProviderFeatureServices = Partial<
    SmtpEmailerServices & SecretsServices & FilesServices & ObservabilityServices
>;

export type UlviaProviderDependencies = CmsContentDependencies &
    CmsCollectionDependencies &
    CmsAccessDependencies &
    UlviaProviderFeatureServices;

type UlviaProviderAdministratorState = Readonly<{
    sub: string;
    enabled: boolean;
    revision: number;
    bootstrap: boolean;
}>;

interface UlviaProviderAdministratorStore {
    canRevoke(sub: string): Promise<boolean>;
    get(sub: string): Promise<UlviaProviderAdministratorState>;
    list(): Promise<readonly string[]>;
    set(sub: string, enabled: boolean, expectedRevision?: number): Promise<UlviaProviderAdministratorState>;
}

export interface UlviaProviderGateway {
    readonly describeContract?: (contractId: string) => Promise<CatalogueContractRelease | null>;
    readonly siteId: string;
    readonly contractUpgrades?: ContractUpgradeService;
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
    readonly administrators: UlviaProviderAdministratorStore;
    readonly identities: ProviderIdentityService;
    readonly routes: GatewayRouteResolver;
    readonly commandAudit: GatewayCommandAuditStore;
    readonly providers?: ProviderAccess;
    readonly delegations?: GatewayDelegationAuthority;
    readonly invocations: {
        prepareProvider?(input: ProviderMachinePreparation): Promise<PreparedProviderMachine>;
        prepare?(input: ProviderDispatchPreparation): Promise<PreparedProviderDispatch>;
        issue(input: ProviderInvocationIssue): Promise<{ token: string; instanceId: string }>;
    };
}

export interface UlviaProviderManagement {
    readonly administration?: ProviderAdministration;
    replaceSelections(input: {
        expectedRevision: number;
        selections: readonly {
            installationId: string;
            contractId: string;
            version: string;
            digest: string;
        }[];
    }): Promise<{ revision: number; selected: readonly ContractSelection[] }>;
    setStatus(input: { installationId: string; revision: number; action: "enable" | "disable" | "revoke" }): Promise<{
        installationId: string;
        status: ProviderInstallationStatus;
        revision: number;
        credentialsDeleted: boolean;
    }>;
}
