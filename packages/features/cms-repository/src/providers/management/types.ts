import type { ReleaseCatalogue } from "cms-repository/contracts/interfaces/ReleaseCatalogue";
import type { ProviderInstallationStore } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ContractSelectionStore } from "cms-repository/providers/selections/interfaces/ContractSelectionStore";

/** Storage-independent provider administration ports for one CMS site. */
export interface ProviderManagementGateway {
    readonly siteId: string;
    readonly releases: ReleaseCatalogue;
    readonly manifests: ProviderManifestCatalogue;
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
}
