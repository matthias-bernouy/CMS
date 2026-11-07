export { CollectionStore } from "repository/collections/installations/core/CollectionStore";
export { SiteInitializationService } from "repository/collections/installations/initialization/execution/service";
export { applyInitializationPages } from "repository/collections/installations/initialization/execution/pages";
export type {
    InitializationServiceOptions,
    InitializationStateStore,
    InitializationRecord,
    InitializationExecution,
    InitializationReview,
} from "repository/collections/installations/initialization/execution/interfaces";
export { planCollectionInitialization } from "repository/collections/installations/initialization/planning/plan";
export type {
    CollectionInitializationPlan,
    InitializationRoot,
    InitializationOptions,
    InitializationRelease,
} from "repository/collections/installations/initialization/interfaces";
export {
    assertCompatibleCollectionUpgrade,
    collectionUpgradeBreakingResources,
    type CollectionBreakingResource,
} from "repository/collections/installations/core/upgradeCompatibility";
export { assertCollectionResourceIsolation } from "repository/collections/installations/core/resourceIsolation";
export { MemoryCollectionStorage } from "repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
export type {
    CollectionStorage,
    CollectionReleaseSummary,
    InstalledCollectionSummary,
    CollectionInstallRequest,
    InstalledCollection,
    InstalledCollectionAssetMetadata,
    CollectionSiteState,
    CollectionInstallation,
    CollectionUpgradeReplacement,
    StoredCollectionRelease,
    StoredCollectionAssetManifest,
    StoredCollectionReleaseMetadata,
} from "repository/collections/installations/interfaces/store";
export { CollectionUpgradeService } from "repository/collections/installations/upgrades/runtime/CollectionUpgradeService";
export {
    prepareCollectionUpgrade,
    type CollectionUpgradeAnalysis,
} from "repository/collections/installations/upgrades/planning/plan";
export { siteUsageInventory } from "repository/collections/installations/upgrades/usage/inventory";
export { collectionUsageInventory } from "repository/collections/installations/upgrades/usage/catalogue";
export type {
    CollectionUpgradePlan,
    CollectionUpgradeTarget,
    UpgradeIssue,
    CollectionResourceChange,
} from "repository/collections/installations/upgrades/interfaces";
export type {
    UsageInventory,
    UsageReference,
    ResourceUse,
    CapabilityUse,
    BindingUse,
    UsageContributor,
} from "repository/collections/installations/upgrades/usage/interfaces";
export type { UpgradeIntent } from "repository/collections/installations/upgrades/storage/interfaces";
