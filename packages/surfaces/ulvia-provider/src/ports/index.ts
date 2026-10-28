import type { ProviderCapabilityInvocationContext } from "../dispatch/registry";
import type { DeliveryActor, ContentDeliveryHost } from "@bernouy/cms-content/public-delivery";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderAdministration } from "./providers";
import type { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import type { McpAuthorization } from "@bernouy/cms-auth/oauth";
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
import type {
    ProviderInstallationStatus,
    ProviderInstallationStore,
} from "@bernouy/cms-repository/providers/installations";
import type {
    ContractSelection,
    ContractSelectionStore,
    ContractUpgradeService,
} from "@bernouy/cms-repository/providers/selections";
import type { FileReference, NamespaceRecord } from "@bernouy/cms-files";
import type { CmsSecrets } from "@bernouy/cms-secrets";
import type { Emailer } from "@bernouy/cms-emailer";
import type { SmtpEmailerAdministration } from "@bernouy/cms-smtp-emailer";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";
import type { CmsObservability } from "@bernouy/cms-observability";

export interface CmsContentDependencies {
    readonly publicDelivery?: (context: ProviderCapabilityInvocationContext) => {
        resolvePath(
            input: unknown,
            actor: DeliveryActor,
            executeQuery?: ContentDeliveryHost["executeQuery"],
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
    readonly collectionAuthoring?: CollectionAuthoring;
    readonly collections: CollectionStore;
    readonly collectionUpgrades: CollectionUpgradeService;
}

export interface CmsAccessDependencies {
    readonly mcpAuthorization?: McpAuthorization;
    readonly users: UsersRepository;
    readonly credentials: LocalCredentialStore;
    readonly pats: PatRepository;
    readonly authentication: {
        authenticate(email: string | undefined, password: string | undefined): Promise<LocalLoginResult>;
        resolveCredential(credential: AuthenticationCredential | undefined): Promise<Subject | null>;
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

export type UlviaProviderDependencies = CmsContentDependencies &
    CmsCollectionDependencies &
    CmsAccessDependencies & {
        readonly emailer?: Emailer & SmtpEmailerAdministration;
        readonly secrets?: CmsSecrets;
        readonly observability?: CmsObservability;
    };

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

export interface CmsFileWorkspace {
    get(input: { offset?: number; limit?: number }): Promise<{
        namespace: NamespaceRecord;
        items: readonly FileReference[];
        offset: number;
        limit: number;
    }>;
    createUpload(input: {
        filename: string;
        size: number;
        contentType?: string;
        visibility?: "private" | "public";
        imageProfile?: "thumbnail" | "responsive";
        fileId?: string;
    }): Promise<{ uploadId: string; uploadToken: string; expiresAt: string; maxBytes: number }>;
    completeUpload(uploadId: string): Promise<FileReference>;
    updateFile(fileId: string, name: string): Promise<FileReference>;
    setFileVisibility(fileId: string, visibility: "private" | "public"): Promise<FileReference>;
    signFile(fileId: string, generation: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: string }>;
    deleteFile(fileId: string): Promise<void>;
}
