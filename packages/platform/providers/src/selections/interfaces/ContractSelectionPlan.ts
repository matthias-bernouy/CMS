import type { SelectionAuthority } from "./SelectionAuthority";
import type { ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
import type { ProviderInstallation } from "ulvia-providers/installations/interfaces/ProviderInstallation";
import type { ProviderInstallationLimits } from "ulvia-providers/installations/core/limits";
import type { ProviderManifestReader } from "ulvia-providers/manifests/interfaces/ProviderManifestReader";
import type { ContractSelection } from "./ContractSelection";

/** The caller supplies one coherent dependency snapshot; catalogues are trusted authority ports. */
export interface ContractSelectionContext {
    readonly releases: ContractReleaseReader;
    readonly manifests: ProviderManifestReader;
    readonly installations: readonly ProviderInstallation[];
    readonly installationLimits?: Readonly<ProviderInstallationLimits>;
}

export interface ContractSelectionDependency {
    readonly source: "provider" | "implementation";
    readonly fromContractId: string;
    readonly fromInstallationId?: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
    readonly optional: boolean;
    /** An optional requirement is checked whenever its contract is selected. */
    readonly present: boolean;
}

/** Structural viability at the supplied snapshot, independent of live readiness. */
export interface ContractSelectionPlan {
    readonly siteId: string;
    readonly selections: readonly ContractSelection[];
    readonly dependencies: readonly ContractSelectionDependency[];
    readonly authority: SelectionAuthority;
    readonly structurallyValid: true;
    readonly runtimeReadiness: "not-evaluated";
}
