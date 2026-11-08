export type {
    CollectionRelease,
    CollectionConfiguration,
    CollectionCapabilityRequirement,
    CollectionDependency,
    CollectionBootstrap,
    CollectionBootstrapPage,
    CollectionBootstrapReference,
    CollectionResourceSelection,
    CollectionResourceImport,
    CollectionResourceImportSelection,
    CollectionTranslationKey,
    CollectionTranslations,
    CollectionResourceDescriptor,
    CollectionResourceKind,
    CollectionResourceDeprecation,
} from "repository/collections/interfaces/CollectionRelease";
export type { CollectionState, CollectionStateScope } from "repository/collections/interfaces/CollectionState";
export type {
    CollectionExample,
    CollectionExamplePreview,
    PageDocument,
} from "repository/collections/interfaces/CollectionExample";
export type {
    CollectionTheme,
    CollectionThemeCategory,
    CollectionThemeToken,
    CollectionThemeTokenType,
} from "repository/collections/interfaces/CollectionTheme";
export type {
    CollectionBloc,
    CollectionComponent,
    CollectionComposition,
    CollectionSlot,
    CollectionSlotAccept,
    CollectionNativeContentProfile,
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
} from "repository/collections/interfaces/CollectionBloc";
export type {
    BlocBrowserCapabilities as CollectionBlocBrowserCapabilities,
    BlocFrameSandboxPermission as CollectionBlocFrameSandboxPermission,
} from "@bernouy/content/page-document";
export { settingsSchema } from "repository/collections/core/parsing/blocs/settingSchema";
export {
    COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS,
    managedNativeAttributesIssue,
} from "repository/collections/core/parsing/blocs/managedNativeElement";
export type {
    CollectionAssetDefinition,
    CollectionBundleAsset,
    VerifiedCollectionAsset,
} from "repository/collections/interfaces/CollectionAssets";
export type {
    AdmittedCollectionRelease,
    CollectionDigest,
} from "repository/collections/interfaces/CollectionAdmission";
export {
    CollectionValidationError,
    CollectionPublicationError,
    COLLECTION_PUBLICATION_ISSUES,
    type CollectionPublicationCode,
    type CollectionPublicationResource,
    type CollectionValidationCode,
} from "repository/collections/core/errors";
export { DEFAULT_COLLECTION_LIMITS, type CollectionLimits } from "repository/collections/core/limits";
export {
    collectionBlocTagIssue,
    collectionThemeSourceId,
    collectionThemeTokenId,
    isCollectionBlocTag,
    isCollectionNamespace,
} from "repository/collections/core/namespace";
export {
    parseCollectionRelease,
    parseCollectionReleaseJson,
} from "repository/collections/core/parsing/parseCollectionRelease";
export {
    parseCollectionTranslationKey,
    parseCollectionTranslations,
    resolveCollectionTranslation,
} from "repository/collections/core/texts/translationCatalogue";
export {
    admitCollectionRelease,
    admitCollectionReleaseJson,
    type CollectionAdmissionOptions,
} from "repository/collections/core/admission/admitCollectionRelease";
export { describeCollectionResources } from "repository/collections/core/admission/resourceDescriptors";
export {
    collectionBrowserRisk,
    collectionBrowserRiskDigest,
    type CollectionBrowserRiskLevel,
    type CollectionBrowserRiskReport,
} from "repository/collections/core/validation/browserCapabilities";
export { verifyCollectionPublicationEvolution } from "repository/collections/core/admission/evolution";
export {
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
    verifyStoredCollectionReleaseJson,
} from "repository/collections/core/admission/collectionArtifact";
export { collectionAssetRepresentationVersion } from "repository/collections/core/admission/assets";
export {
    replaceCollectionAssetExpressions,
    rewriteCollectionAssetReferences,
} from "repository/collections/core/texts/expressions";
export { documentRequirements } from "repository/collections/core/admission/documentRequirements";
export { compileBlocStyle } from "repository/collections/core/validation/styles/compile";
export {
    pageBlocHostAttributesIssue,
    type PageBlocHostContract,
} from "repository/collections/core/validation/pageDocument/hostAttributes";

export * from "./texts";

export { collectionExampleDocument } from "repository/collections/core/validation/examples/document";

export { verifyCollectionPublicationHistory } from "repository/collections/core/admission/history";
