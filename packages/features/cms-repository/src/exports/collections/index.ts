export type {
    CollectionRelease,
    CollectionConfiguration,
    CollectionCapabilityRequirement,
    CollectionDependency,
    CollectionResourceSelection,
    CollectionTranslationKey,
    CollectionTranslations,
    CollectionDataMigration,
    CollectionMigrationOperation,
    CollectionResourceDescriptor,
    CollectionResourceKind,
} from "cms-repository/collections/interfaces/CollectionRelease";
export type { CollectionView } from "cms-repository/collections/interfaces/CollectionView";
export type {
    CollectionDashboard,
    CollectionDashboardNavigationItem,
} from "cms-repository/collections/interfaces/CollectionDashboard";
export type {
    CollectionTheme,
    CollectionThemeCategory,
    CollectionThemeToken,
    CollectionThemeTokenType,
} from "cms-repository/collections/interfaces/CollectionTheme";
export type {
    CollectionBloc,
    CollectionComponent,
    CollectionComposition,
    CollectionSlot,
    CollectionSlotAccept,
    CollectionRichTextProfile,
    CollectionMediaAccept,
    CollectionComponentSettings,
    CollectionSettingControl,
    CollectionSettingItem,
    CollectionSettingOption,
    CollectionSettingVisibilityRule,
    CollectionSettingVisibilityValue,
    CollectionManagedNativeElementTag,
    CollectionManagedNativeAttributeConstraint,
    CollectionManagedNativeElement,
} from "cms-repository/collections/interfaces/CollectionBloc";
export { collectionSettingsSchema } from "cms-repository/collections/core/parsing/blocs/settingSchema";
export {
    COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS,
    managedNativeAttributesIssue,
} from "cms-repository/collections/core/parsing/blocs/managedNativeElement";
export type {
    CollectionAssetDefinition,
    CollectionBundleAsset,
    VerifiedCollectionAsset,
} from "cms-repository/collections/interfaces/CollectionAssets";
export type {
    AdmittedCollectionRelease,
    CollectionDigest,
} from "cms-repository/collections/interfaces/CollectionAdmission";
export { CollectionValidationError, type CollectionValidationCode } from "cms-repository/collections/core/errors";
export { DEFAULT_COLLECTION_LIMITS, type CollectionLimits } from "cms-repository/collections/core/limits";
export {
    collectionThemeSourceId,
    collectionThemeTokenId,
    isCollectionNamespace,
} from "cms-repository/collections/core/namespace";
export {
    parseCollectionRelease,
    parseCollectionReleaseJson,
} from "cms-repository/collections/core/parsing/parseCollectionRelease";
export {
    parseCollectionTranslationKey,
    parseCollectionTranslations,
    resolveCollectionTranslation,
} from "cms-repository/collections/core/texts/translationCatalogue";
export {
    admitCollectionRelease,
    admitCollectionReleaseJson,
    type CollectionAdmissionOptions,
} from "cms-repository/collections/core/admission/admitCollectionRelease";
export { describeCollectionResources } from "cms-repository/collections/core/admission/resourceDescriptors";
export { collectionAssetRepresentationVersion } from "cms-repository/collections/core/admission/assets";
export { replaceCollectionAssetExpressions } from "cms-repository/collections/core/texts/expressions";

export * from "./texts";
