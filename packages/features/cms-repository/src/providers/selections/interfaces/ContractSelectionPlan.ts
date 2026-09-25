import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { ProviderInstallation } from "cms-repository/providers/installations/interfaces/ProviderInstallation";
import type { ProviderInstallationLimits } from "cms-repository/providers/installations/core/limits";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ContractSelection } from "./ContractSelection";

/** The caller supplies one coherent dependency snapshot; catalogues are trusted authority ports. */
export interface ContractSelectionContext {
    readonly releases: ReleaseCatalogue;
    readonly manifests: ProviderManifestCatalogue;
    readonly installations: readonly ProviderInstallation[];
    readonly installationLimits?: Readonly<ProviderInstallationLimits>;
}

export interface ContractSelectionDependency {
    readonly source: "contract" | "implementation";
    readonly fromContractId: string;
    readonly fromCapabilityId?: string;
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
    readonly optional: boolean;
    /** An optional requirement is checked whenever its contract is selected. */
    readonly present: boolean;
}

/** Structural viability at the supplied snapshot, never live readiness or conformance evidence. */
export interface ContractSelectionPlan {
    readonly siteId: string;
    readonly selections: readonly ContractSelection[];
    readonly dependencies: readonly ContractSelectionDependency[];
    readonly structurallyValid: true;
    readonly runtimeReadiness: "not-evaluated";
}
