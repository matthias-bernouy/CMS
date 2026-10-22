import type {
    AuthenticationCredential,
    LocalCredentialStore,
    LocalLoginResult,
    PatRepository,
    PublicAuthActions,
    Subject,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content";
import type { RegisteredPageRoute } from "@bernouy/cms-content/kernel";
import type { CollectionMigrationService } from "@bernouy/cms-repository/collections/installations";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type {
    ProviderInstallationStatus,
    ProviderInstallationStore,
} from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection, ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { FileReference, NamespaceRecord } from "@bernouy/cms-files";
import type { CmsSecrets } from "@bernouy/cms-secrets";
import type { Emailer, EmailerAdministration } from "@bernouy/cms-emailer";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";

export interface CmsContentDependencies {
    readonly repo: CmsRepository;
    readonly collections: CollectionStore;
    readonly resolvePageRoute?: (path: string) => Promise<RegisteredPageRoute | null>;
    readonly sitemapStore?: BlobStore;
    readonly logger?: Logger;
}

export interface CmsCollectionDependencies {
    readonly collections: CollectionStore;
    readonly collectionMigrations: CollectionMigrationService;
}

export interface CmsAccessDependencies {
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
        readonly emailer?: Emailer & EmailerAdministration;
        readonly secrets?: CmsSecrets;
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
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
    readonly administrators: UlviaProviderAdministratorStore;
    readonly identities: ProviderIdentityService;
    readonly routes: GatewayRouteResolver;
    readonly commandAudit: GatewayCommandAuditStore;
    readonly invocations: {
        issue(input: {
            requestId: string;
            installationId: string;
            contractId: string;
            contractVersion: string;
            capabilityId: string;
            subjectId?: string;
        }): Promise<{ token: string; instanceId: string }>;
    };
}

export interface UlviaProviderManagement {
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
