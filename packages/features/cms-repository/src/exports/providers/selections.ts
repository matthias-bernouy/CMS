export type { ContractSelectionStore } from "cms-repository/providers/selections/interfaces/ContractSelectionStore";

export { InMemoryContractSelectionStore } from "cms-repository/providers/selections/default-implementation/InMemoryContractSelectionStore";
export { CatalogueSelectionDependencies } from "cms-repository/providers/selections/default-implementation/CatalogueSelectionDependencies";

export { ContractUpgradeService } from "cms-repository/providers/selections/core/upgrades/ContractUpgradeService";
export { prepareContractUpgrade } from "cms-repository/providers/selections/core/upgrades/plan";
export type {
    ContractUpgradePlan,
    ContractUpgradeAnalysis,
    ContractUpgradeIssue,
    CapabilityUsageEvidence,
} from "cms-repository/providers/selections/interfaces/ContractUpgrade";
export { validateCapabilityUsage } from "cms-repository/providers/selections/core/upgrades/requirements";
