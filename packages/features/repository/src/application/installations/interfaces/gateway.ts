import type { CatalogueContractRelease } from "@bernouy/ulvia-contracts/catalogue";
import type {
    ProviderMachinePreparation,
    PreparedProviderMachine,
    ProviderDispatchPreparation,
    PreparedProviderDispatch,
    ProviderInvocationIssue,
} from "@bernouy/cms-gateway/protocol";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ContractSelectionStore } from "repository/providers/selections/interfaces/ContractSelectionStore";
import type { ContractUpgradeService } from "repository/exports/providers/selections";
export interface InstallationGateway {
    readonly administrators?: { get(sub: string): Promise<{ readonly enabled: boolean }> };
    readonly describeContract?: (contractId: string) => Promise<CatalogueContractRelease | null>;
    readonly siteId: string;
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
        prepare?(input: ProviderDispatchPreparation): Promise<PreparedProviderDispatch>;
        issue(input: ProviderInvocationIssue): Promise<{ token: string; instanceId: string }>;
    };
}
