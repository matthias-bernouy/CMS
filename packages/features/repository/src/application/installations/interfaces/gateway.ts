import type { CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type {
    ProviderCommandPreparation,
    ProviderMachinePreparation,
    PreparedProviderMachine,
    ProviderDispatchPreparation,
    PreparedProviderDispatch,
    ProviderInvocationIssue,
} from "@bernouy/cms-gateway/protocol";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayActor } from "@bernouy/cms-gateway";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ContractSelectionStore } from "repository/providers/selections/interfaces/ContractSelectionStore";
import type { ContractUpgradeService } from "repository/exports/providers/selections";
export interface InstallationGateway {
    readonly administrators?: { get(sub: string): Promise<{ readonly enabled: boolean }> };
    readonly describeContract?: (contractId: string) => Promise<CatalogueContractRelease | null>;
    readonly siteId: string;
    /** Fresh complete catalogue/selection/installation revision fingerprint, or null to disable index reuse. */
    readonly catalogueRevision?: () => Promise<string | null>;
    /** Fresh ordinary selected-catalogue authorization, including current user state. */
    readonly authorizeMcpCatalogue?: (actor: GatewayActor) => Promise<void>;
    readonly contractUpgrades?: ContractUpgradeService;
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
    readonly identities: ProviderIdentityService;
    readonly routes: GatewayRouteResolver;
    readonly commandAudit: GatewayCommandAuditStore;
    readonly providers?: ProviderAccess;
    readonly delegations?: GatewayDelegationAuthority;
    readonly invocations: {
        prepareProvider?(input: ProviderMachinePreparation): Promise<PreparedProviderMachine>;
        prepareCommand?(input: ProviderCommandPreparation): Promise<PreparedProviderDispatch>;
        prepare?(input: ProviderDispatchPreparation): Promise<PreparedProviderDispatch>;
        issue(input: ProviderInvocationIssue): Promise<{ token: string; instanceId: string }>;
    };
}
