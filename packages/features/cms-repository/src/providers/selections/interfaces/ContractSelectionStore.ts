import type { ContractSelectionContext, ContractSelectionPlan } from "./ContractSelectionPlan";

export interface ContractSelectionDependencySnapshot extends ContractSelectionContext {
    /** Must change for every relevant installation, release, manifest or yank mutation. */
    readonly revision: string;
}

/** Composition roots provide coherent snapshots and revision checks; this is not a distributed transaction. */
export interface ContractSelectionDependencySource {
    /** Optional revision-only read; its value must match capture().revision for the same state. */
    revision?(siteId: string): Promise<string>;
    capture(siteId: string): Promise<ContractSelectionDependencySnapshot>;
    isCurrent(siteId: string, revision: string): Promise<boolean>;
}

/** Site execution policy is independent from exact release/provider choices and actor roles. */
export interface CapabilityGrantPolicy {
    readonly default: "allow-selected";
    readonly denied: readonly Readonly<{ contractId: string; capabilityId: string }>[];
}

export interface StoredContractSelections {
    readonly siteId: string;
    readonly revision: number;
    readonly dependencyRevision: string;
    readonly grants: CapabilityGrantPolicy;
    readonly plan: ContractSelectionPlan;
}

export interface ContractSelectionStore {
    /** Historical snapshots remain readable after dependencies change or are yanked. */
    get(siteId: string): Promise<StoredContractSelections | null>;
    /** Revalidates the entire proposed site graph. Zero is the revision of an absent site. */
    replace(
        siteId: string,
        selections: unknown,
        expectedRevision: number,
        grants?: CapabilityGrantPolicy,
    ): Promise<StoredContractSelections>;
}
