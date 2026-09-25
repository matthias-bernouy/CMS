import type { ContractSelectionContext, ContractSelectionPlan } from "./ContractSelectionPlan";

export interface ContractSelectionDependencySnapshot extends ContractSelectionContext {
    /** Must change for every relevant installation, release, manifest or yank mutation. */
    readonly revision: string;
}

/** Composition roots provide coherent snapshots and revision checks; this is not a distributed transaction. */
export interface ContractSelectionDependencySource {
    capture(siteId: string): Promise<ContractSelectionDependencySnapshot>;
    isCurrent(siteId: string, revision: string): Promise<boolean>;
}

export interface StoredContractSelections {
    readonly siteId: string;
    readonly revision: number;
    readonly dependencyRevision: string;
    readonly plan: ContractSelectionPlan;
}

export interface ContractSelectionStore {
    /** Historical snapshots remain readable after dependencies change or are yanked. */
    get(siteId: string): Promise<StoredContractSelections | null>;
    /** Revalidates the entire proposed site graph. Zero is the revision of an absent site. */
    replace(siteId: string, selections: unknown, expectedRevision: number): Promise<StoredContractSelections>;
}
