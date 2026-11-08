import type { CollectionVerifier } from "@bernouy/repository/collections/sources";
import { SiteInitializationService } from "@bernouy/repository/collections/installations";
import type { CollectionStore } from "@bernouy/repository/collections/installations";
import type { MongoInitializationStateStore } from "@bernouy/repository/collections/mongo";
import type { ContentRepository } from "@bernouy/content";
import type { CollectionRepositorySource } from "@bernouy/repository/collections/sources";
import type { ContractSelectionStore } from "@bernouy/repository/providers/selections";
import type { ProviderExecutionStateReader } from "@bernouy/ulvia-providers/selections";
import type { ReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import type { SiteUpgradeStorage } from "@bernouy/repository/upgrades";
import { initializationExecution } from "../selections/initializationExecution";
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
    verifier?: CollectionVerifier,
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
            verifier,
            execution: initializationExecution("default", selections, executionState, releases),
            validateCandidate: previewInitialization(repository, selections, releases, verifier),
        });
}
