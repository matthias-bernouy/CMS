import type { ContentServices } from "@bernouy/cms-content/feature";
import type { RepositoryDiscovery } from "@bernouy/cms-repository/repository/search";
import type { CmsDocumentation } from "@bernouy/cms-documentation";
import type { ProviderMachinePreparation, PreparedProviderMachine } from "@bernouy/cms-gateway/protocol";
import type { ProviderDispatchPreparation, PreparedProviderDispatch } from "@bernouy/cms-gateway/protocol";
import type { CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderAdministration } from "./providers";
import type { AuthoringServices, AuthoringService } from "@bernouy/cms-repository/features/authoring";
import type { AccessServices } from "@bernouy/cms-auth/feature";
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

export interface CmsContentDependencies
    extends Pick<ContentServices, "repo" | "contentQuery">,
        Partial<Pick<ContentServices, "publicDelivery">> {
    readonly collections: CollectionStore;
    readonly sitemapStore?: BlobStore;
    readonly logger?: Logger;
}

export interface CmsCollectionDependencies {
    readonly documentation?: CmsDocumentation;
    readonly repositoryDiscovery?: RepositoryDiscovery;
    readonly authoring?: AuthoringService;
    readonly collections: CollectionStore;
    readonly collectionUpgrades: CollectionUpgradeService;
}

/** Ports supplied by the runtime for SDK feature implementations. */
export type UlviaProviderFeatureServices = Partial<
    SmtpEmailerServices &
        SecretsServices &
        FilesServices &
        ObservabilityServices &
        AccessServices &
        ContentServices &
        AuthoringServices
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
