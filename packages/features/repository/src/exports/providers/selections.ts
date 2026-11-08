export type { ContractSelectionStore } from "repository/providers/selections/interfaces/ContractSelectionStore";

export { InMemoryContractSelectionStore } from "repository/providers/selections/default-implementation/InMemoryContractSelectionStore";
export { CatalogueSelectionDependencies } from "repository/providers/selections/default-implementation/CatalogueSelectionDependencies";

export { ContractUpgradeService } from "repository/providers/selections/core/upgrades/ContractUpgradeService";
export { prepareContractUpgrade } from "repository/providers/selections/core/upgrades/plan";
export type {
    ContractUpgradePlan,
    ContractUpgradeAnalysis,
    ContractUpgradeIssue,
    CapabilityUsageEvidence,
} from "repository/providers/selections/interfaces/ContractUpgrade";
export { validateCapabilityUsage } from "repository/providers/selections/core/upgrades/requirements";
