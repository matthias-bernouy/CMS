import type { SelectionAuthority } from "./SelectionAuthority";
import type { ContractSelection } from "./ContractSelection";
import type { CapabilityGrantPolicy } from "./ContractSelectionStore";

export type CapabilityUsageEvidence = Readonly<{
    complete: boolean;
    revision: string;
    requirements: readonly Readonly<{
        contractId: string;
        capabilityId?: string;
        bindingPath?: string;
        versionRange?: string;
        location: string;
    }>[];
    unknown: readonly string[];
}>;
export type ContractUpgradeIssue = Readonly<{ code: string; location: string; message: string; replacement?: string }>;
export type ContractUpgradePlan = Readonly<{
    siteId: string;
    status: "applicable" | "blocked" | "incomplete";
    expectedRevision: number;
    source: readonly ContractSelection[];
    selections: readonly ContractSelection[];
    grants: CapabilityGrantPolicy;
    issues: readonly ContractUpgradeIssue[];
    usageRevision: string;
    dependencyRevision: string;
    served: Readonly<Record<string, string>>;
    planDigest: string;
    authority: SelectionAuthority;
    authorityAdded: SelectionAuthority["delegated"];
}>;
export type ContractUpgradeAnalysis = Readonly<{
    usage(siteId: string): Promise<CapabilityUsageEvidence>;
    served(selection: ContractSelection): Promise<Readonly<{ available: boolean; revision: string }>>;
    protectedContracts?: readonly string[];
}>;
