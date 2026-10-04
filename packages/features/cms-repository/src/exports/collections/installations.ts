export { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";
export {
    assertCompatibleCollectionUpgrade,
    collectionUpgradeBreakingResources,
    type CollectionBreakingResource,
} from "cms-repository/collections/installations/core/upgradeCompatibility";
export { assertCollectionResourceIsolation } from "cms-repository/collections/installations/core/resourceIsolation";
export { MemoryCollectionStorage } from "cms-repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
export type {
    CollectionStorage,
    CollectionInstallRequest,
    InstalledCollection,
    InstalledCollectionAssetMetadata,
    CollectionSiteState,
    CollectionInstallation,
    CollectionMigrationReplacement,
    StoredCollectionRelease,
    StoredCollectionReleaseMetadata,
} from "cms-repository/collections/installations/interfaces/store";
