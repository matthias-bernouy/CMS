export { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";
export { SiteInitializationService } from "cms-repository/collections/installations/initialization/execution/service";
export { applyInitializationPages } from "cms-repository/collections/installations/initialization/execution/pages";
export type {
    InitializationServiceOptions,
    InitializationStateStore,
    InitializationRecord,
    InitializationExecution,
    InitializationReview,
} from "cms-repository/collections/installations/initialization/execution/interfaces";
export { planCollectionInitialization } from "cms-repository/collections/installations/initialization/planning/plan";
export type {
    CollectionInitializationPlan,
    InitializationRoot,
    InitializationOptions,
    InitializationRelease,
} from "cms-repository/collections/installations/initialization/interfaces";
export {
    assertCompatibleCollectionUpgrade,
    collectionUpgradeBreakingResources,
    type CollectionBreakingResource,
} from "cms-repository/collections/installations/core/upgradeCompatibility";
export { assertCollectionResourceIsolation } from "cms-repository/collections/installations/core/resourceIsolation";
export { MemoryCollectionStorage } from "cms-repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
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
} from "cms-repository/collections/installations/interfaces/store";
export { CollectionUpgradeService } from "cms-repository/collections/installations/upgrades/runtime/CollectionUpgradeService";
export {
    prepareCollectionUpgrade,
    type CollectionUpgradeAnalysis,
} from "cms-repository/collections/installations/upgrades/planning/plan";
export { siteUsageInventory } from "cms-repository/collections/installations/upgrades/usage/inventory";
export { collectionUsageInventory } from "cms-repository/collections/installations/upgrades/usage/catalogue";
export type {
    CollectionUpgradePlan,
    CollectionUpgradeTarget,
    UpgradeIssue,
    CollectionResourceChange,
} from "cms-repository/collections/installations/upgrades/interfaces";
export type {
    UsageInventory,
    UsageReference,
    ResourceUse,
    CapabilityUse,
    BindingUse,
    UsageContributor,
} from "cms-repository/collections/installations/upgrades/usage/interfaces";
export type { UpgradeIntent } from "cms-repository/collections/installations/upgrades/storage/interfaces";
