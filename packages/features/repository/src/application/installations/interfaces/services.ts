import type {
    ListCollectionCatalogueInput,
    ListCollectionReleasesInput,
    GetCollectionReleaseInput,
} from "repository/application/installations/interfaces/inputs";
import type {
    ListCollectionCatalogueOutput,
    ListCollectionReleasesOutput,
    GetCollectionReleaseOutput,
} from "repository/application/installations/interfaces/outputs";
import type { InitializationService } from "repository/application/installations/interfaces/initialization";
import type { CollectionStore } from "repository/collections/installations/core/CollectionStore";
import type { CollectionUpgradeService } from "repository/exports/collections/installations";
import type { AdmittedCollectionRelease } from "repository/collections/interfaces/CollectionAdmission";
import type { RepositoryDiscovery } from "repository/exports/repository/search/index";
import type { CmsDocumentation } from "@bernouy/documentation";
import type { InstallationGateway } from "repository/application/installations/interfaces/gateway";
import type { InstallationManagement } from "repository/application/installations/interfaces/management";
import type { InstallationOperationQueries } from "repository/application/installations/interfaces/operations";
import type { ListAvailableCollectionsOutput } from "repository/application/installations/interfaces/outputs";
import type { InstallCollectionInput } from "repository/application/installations/interfaces/inputs";
export interface CollectionSourceReader {
    readonly discovery: {
        list(
            siteId: string,
            input: ListCollectionCatalogueInput,
            signal?: AbortSignal,
        ): Promise<ListCollectionCatalogueOutput>;
        history(
            siteId: string,
            input: ListCollectionReleasesInput,
            signal?: AbortSignal,
        ): Promise<ListCollectionReleasesOutput>;
        review(
            siteId: string,
            input: GetCollectionReleaseInput,
            signal?: AbortSignal,
        ): Promise<GetCollectionReleaseOutput>;
    };
    catalogue(
        siteId: string,
        channel: "stable" | "beta" | "all",
        signal?: AbortSignal,
    ): Promise<ListAvailableCollectionsOutput>;
    stage(targets: InstallCollectionInput["targets"]): Promise<readonly { digest: string; repositoryId: string }[]>;
    prepare(
        targets: InstallCollectionInput["targets"],
        signal?: AbortSignal,
    ): Promise<readonly { target: { digest: string; repositoryId: string }; artifact: AdmittedCollectionRelease }[]>;
}
export interface InstallationServices {
    readonly initialization?: InitializationService;
    readonly collections: Pick<
        CollectionStore,
        "listInstalled" | "readInstalled" | "revision" | "getRelease" | "installMany" | "saveConfiguration"
    >;
    readonly collectionUpgrades: Pick<CollectionUpgradeService, "inventory" | "storage" | "plan" | "apply" | "resume">;
    readonly gateway?: InstallationGateway;
    readonly management?: InstallationManagement;
    readonly sources?: CollectionSourceReader;
    readonly documentation?: Pick<CmsDocumentation, "search" | "get">;
    readonly discovery?: Pick<RepositoryDiscovery, "search" | "get">;
    readonly operations?: InstallationOperationQueries;
}
