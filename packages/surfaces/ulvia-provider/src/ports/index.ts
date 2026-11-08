import type {
    InstallationServices,
    InstallationGateway,
    InstallationManagement,
} from "@bernouy/cms-repository/features/installations";
import type { RepositoryServices } from "@bernouy/cms-repository/features/repository";
import type { ProviderConnectionServices } from "../capabilities/features/provider/connections/interfaces";
import type { ContentServices } from "@bernouy/cms-content/feature";
import type { AuthoringServices, AuthoringService } from "@bernouy/cms-repository/features/authoring";
import type { AccessServices } from "@bernouy/cms-auth/feature";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { ContractSelection } from "@bernouy/ulvia-providers/selections";
import type { FilesServices } from "@bernouy/cms-files/feature";
export type { CmsFileWorkspace } from "@bernouy/cms-files/feature";
import type { SecretsServices } from "@bernouy/cms-secrets/feature";
import type { SmtpEmailerServices } from "@bernouy/email-smtp/feature";
import type { BlobStore } from "@bernouy/blob-store";
import type { Logger } from "@bernouy/logging";
import type { ObservabilityServices } from "@bernouy/cms-observability/feature";

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
