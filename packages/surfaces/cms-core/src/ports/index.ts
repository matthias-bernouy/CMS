import type { BlobStore } from "@bernouy/blob-store";
import type {
    IdentityProviderRepository,
    LocalCredentialStore,
    PatRepository,
    UsersRepository,
} from "@bernouy/cms-auth";
import type { CmsRepository } from "@bernouy/cms-content";
import type { CmsFileMutationJournal, CmsFilesMetadataRepository } from "@bernouy/cms-content/files";
import type { CollectionMigrationService } from "@bernouy/cms-content/migrations";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type {
    ProviderInstallationStatus,
    ProviderInstallationStore,
} from "@bernouy/cms-repository/providers/installations";
import type { ContractSelection, ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";

export interface CmsPageDependencies {
    readonly repo: CmsRepository;
}

export interface CmsCollectionDependencies {
    readonly collections: CollectionStore;
    readonly collectionMigrations: CollectionMigrationService;
}

export interface CmsDesignDependencies {
    readonly repo: CmsRepository;
    readonly collections: CollectionStore;
}

export interface CmsFileDependencies {
    readonly filesMetadata: CmsFilesMetadataRepository;
    readonly filesBlob: BlobStore;
    readonly fileMutations: CmsFileMutationJournal;
}

export interface CmsAccessDependencies {
    readonly repo: CmsRepository;
    readonly users: UsersRepository;
    readonly identityProviders: IdentityProviderRepository;
    readonly credentials: LocalCredentialStore;
    readonly pats: PatRepository;
}

export type CmsCoreDependencies = CmsPageDependencies &
    CmsCollectionDependencies &
    CmsDesignDependencies &
    CmsFileDependencies &
    CmsAccessDependencies;

export type CmsCoreAdministratorState = Readonly<{
    sub: string;
    enabled: boolean;
    revision: number;
    bootstrap: boolean;
}>;

export interface CmsCoreAdministratorStore {
    canRevoke(sub: string): Promise<boolean>;
    get(sub: string): Promise<CmsCoreAdministratorState>;
    list(): Promise<readonly string[]>;
    set(sub: string, enabled: boolean, expectedRevision?: number): Promise<CmsCoreAdministratorState>;
}

export interface CmsCoreGateway {
    readonly siteId: string;
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
    readonly administrators: CmsCoreAdministratorStore;
    readonly identities: ProviderIdentityService;
}

export interface CmsCoreProviderManagement {
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
