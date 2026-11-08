import type {
    InstallationServices,
    InstallationGateway,
    InstallationManagement,
} from "@bernouy/repository/features/installations";
import type { RepositoryServices } from "@bernouy/repository/features/repository";
import type { ProviderConnectionServices } from "../capabilities/features/provider/connections/interfaces";
import type { ContentServices } from "@bernouy/content/feature";
import type { AuthoringServices, AuthoringService } from "@bernouy/repository/features/authoring";
import type { AccessServices } from "@bernouy/auth/feature";
import type { CollectionStore } from "@bernouy/repository/collections/installations";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import type { FilesServices } from "@bernouy/files/feature";
export type { CmsFileWorkspace } from "@bernouy/files/feature";
import type { SecretsServices } from "@bernouy/secrets/feature";
import type { SmtpEmailerServices } from "@bernouy/email-smtp/feature";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";
import type { ObservabilityServices } from "@bernouy/observability/feature";

export interface CmsContentDependencies
    extends Pick<ContentServices, "repo" | "contentQuery">,
        Partial<Pick<ContentServices, "publicDelivery">> {
    readonly collections: CollectionStore;
    readonly sitemapStore?: BlobStore;
    readonly logger?: Logger;
}

export interface CmsCollectionDependencies {
    readonly documentation?: InstallationServices["documentation"];
    readonly repositoryDiscovery?: InstallationServices["discovery"];
    readonly authoring?: AuthoringService;
    readonly collections: CollectionStore;
    readonly collectionUpgrades: InstallationServices["collectionUpgrades"];
}

/** Ports supplied by the runtime for SDK feature implementations. */
export type UlviaProviderFeatureServices = Partial<
    SmtpEmailerServices &
        SecretsServices &
        FilesServices &
        ObservabilityServices &
        AccessServices &
        ContentServices &
        AuthoringServices &
        ProviderConnectionServices &
        RepositoryServices &
        InstallationServices
>;

export type UlviaProviderDependencies = CmsContentDependencies &
    CmsCollectionDependencies &
    Omit<AccessServices, "governance"> &
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

export interface UlviaProviderGateway extends InstallationGateway {
    readonly administrators: UlviaProviderAdministratorStore;
}

export interface UlviaProviderManagement extends InstallationManagement {
    replaceSelections(input: {
        expectedRevision: number;
        selections: readonly {
            installationId: string;
            contractId: string;
            version: string;
            digest: string;
        }[];
    }): Promise<{ revision: number; selected: readonly ContractSelection[] }>;
}
