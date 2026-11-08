import type { ReleaseCatalogue } from "repository/exports/contracts/catalogue";
import type { ProviderInstallationStore } from "repository/providers/installations/interfaces/ProviderInstallationStore";
import type { ProviderManifestCatalogue } from "repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ContractSelectionStore } from "repository/providers/selections/interfaces/ContractSelectionStore";

/** Storage-independent provider administration ports for one CMS site. */
export interface ProviderManagementGateway {
    readonly siteId: string;
    readonly releases: ReleaseCatalogue;
    readonly manifests: ProviderManifestCatalogue;
    readonly installations: ProviderInstallationStore;
    readonly selections: ContractSelectionStore;
}
