import type { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";
import type { CollectionUpgradeService } from "cms-repository/exports/collections/installations";
import type { AdmittedCollectionRelease } from "cms-repository/collections/interfaces/CollectionAdmission";
import type { RepositoryDiscovery } from "cms-repository/exports/repository/search/index";
import type { CmsDocumentation } from "@bernouy/cms-documentation";
import type { InstallationGateway } from "cms-repository/application/installations/interfaces/gateway";
import type { InstallationManagement } from "cms-repository/application/installations/interfaces/management";
import type { InstallationOperationQueries } from "cms-repository/application/installations/interfaces/operations";
import type { ListAvailableCollectionsOutput } from "cms-repository/application/installations/interfaces/outputs";
import type { InstallCollectionInput } from "cms-repository/application/installations/interfaces/inputs";
export interface CollectionSourceReader {
    catalogue(siteId: string, channel: "stable" | "beta" | "all"): Promise<ListAvailableCollectionsOutput>;
    stage(targets: InstallCollectionInput["targets"]): Promise<readonly { digest: string; repositoryId: string }[]>;
    prepare(
        targets: InstallCollectionInput["targets"],
    ): Promise<readonly { target: { digest: string; repositoryId: string }; artifact: AdmittedCollectionRelease }[]>;
}
export interface InstallationServices {
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
