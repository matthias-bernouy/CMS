import type { StoredContractSelections } from "./ContractSelectionStore";
import type { StoredProviderInstallation } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";

/** Repository-owned metadata for one authorization phase; this is not a distributed snapshot. */
export interface ProviderExecutionState {
    readonly selections: StoredContractSelections | null;
    readonly installations: readonly StoredProviderInstallation[];
}

export interface ProviderExecutionStateReader {
    /** Every call reads fresh revisions. Access decisions and secret values are outside this port. */
    read(siteId: string, installationIds: readonly string[]): Promise<ProviderExecutionState>;
}
