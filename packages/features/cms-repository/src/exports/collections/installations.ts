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
export {
    CollectionMigrationService,
    type CollectionMigrationServiceOptions,
} from "cms-repository/collections/installations/migrations/runtime/CollectionMigrationService";
export { prepareCollectionMigration } from "cms-repository/collections/installations/migrations/plan";
export {
    MemoryCollectionMigrationStorage,
    isCollectionMigrationActive,
} from "cms-repository/collections/installations/migrations/storage";
export { withCollectionMigrationWriteFence } from "cms-repository/collections/installations/migrations/storage/writeFence";
export type {
    CollectionMigrationPageChange,
    CollectionMigrationActive,
    CollectionMigrationAudit,
    CollectionMigrationParticipant,
    CollectionMigrationParticipantSnapshot,
    CollectionMigrationTargetSnapshot,
    CollectionMigrationProgress,
    CollectionMigrationRecord,
    CollectionMigrationResourceReference,
    CollectionMigrationResourceChange,
    CollectionMigrationStatus,
    CollectionMigrationStorage,
    CollectionMigrationWriteFence,
    CollectionMigrationSummary,
    CollectionMigrationTarget,
    PreparedCollectionMigration,
} from "cms-repository/collections/installations/migrations/interfaces";
