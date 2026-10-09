export type {
    CollectionRelease,
    CollectionConfiguration,
    CollectionCapabilityRequirement,
    CollectionDependency,
    CollectionResourceSelection,
    CollectionResourceImport,
    CollectionResourceImportSelection,
    CollectionTranslationKey,
    CollectionTranslations,
    CollectionDataMigration,
    CollectionMigrationOperation,
    CollectionResourceDescriptor,
    CollectionResourceKind,
} from "cms-repository/collections/interfaces/CollectionRelease";
export type {
    CollectionPage,
    CollectionPageDocument,
    CollectionPageSurface,
    PageDocument,
    PageSurface,
} from "cms-repository/collections/interfaces/CollectionPage";
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
export { settingsSchema } from "cms-repository/collections/core/parsing/blocs/settingSchema";
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
    collectionBlocTagIssue,
    collectionThemeSourceId,
    collectionThemeTokenId,
    isCollectionBlocTag,
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
export { verifyCollectionPublicationEvolution } from "cms-repository/collections/core/admission/evolution";
export {
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
} from "cms-repository/collections/core/admission/collectionArtifact";
export { collectionAssetRepresentationVersion } from "cms-repository/collections/core/admission/assets";
export { replaceCollectionAssetExpressions } from "cms-repository/collections/core/texts/expressions";
export {
    collectionPageRequirements,
    pageRequirements,
} from "cms-repository/collections/core/admission/pageRequirements";
export { pageReferenceSources } from "cms-repository/collections/core/parsing/pages/references";
export {
    pageBlocHostAttributesIssue,
    type PageBlocHostContract,
} from "cms-repository/collections/core/validation/pageDocument/hostAttributes";

export * from "./texts";
