import { SiteInitializationService } from "@bernouy/cms-repository/collections/installations";
import type { CollectionStore } from "@bernouy/cms-repository/collections/installations";
import type { MongoInitializationStateStore } from "@bernouy/cms-repository/collections/mongo";
import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionRepositorySource } from "@bernouy/cms-repository/collections/sources";
import type {
    ContractSelectionStore,
    ProviderExecutionStateReader,
} from "@bernouy/cms-repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type { SiteUpgradeStorage } from "@bernouy/cms-repository/upgrades";
import { initializationExecution } from "./initializationExecution";
import { previewInitialization } from "./previewInitialization";

export function initializationFactory(
    instanceId: string,
    state: MongoInitializationStateStore,
    repository: ContentRepository,
    collections: CollectionStore,
    upgrades: SiteUpgradeStorage,
    selections: ContractSelectionStore,
    executionState: ProviderExecutionStateReader,
    releases: ReleaseCatalogue,
) {
    return (source: CollectionRepositorySource) =>
        new SiteInitializationService({
            instanceId,
            siteId: "default",
            state,
            repository,
            collections,
            upgrades,
            source,
            execution: initializationExecution("default", selections, executionState, releases),
            validateCandidate: previewInitialization(repository, selections, releases),
        });
}
