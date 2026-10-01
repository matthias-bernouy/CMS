export type {
    CollectionRelease,
    CollectionConfiguration,
    CollectionCapabilityRequirement,
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
} from "cms-repository/collections/interfaces/CollectionTheme";
export type {
    CollectionBloc,
    CollectionComponent,
    CollectionComposition,
    CollectionSlot,
    CollectionSlotAccept,
    CollectionMediaAccept,
    CollectionComponentSettings,
    CollectionEndpointMethod,
    CollectionSettingControl,
    CollectionSettingItem,
    CollectionSettingOption,
    CollectionSettingVisibilityRule,
    CollectionSettingVisibilityValue,
} from "cms-repository/collections/interfaces/CollectionBloc";
export { collectionSettingsSchema } from "cms-repository/collections/core/parsing/blocs/settings";
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
    admitCollectionRelease,
    admitCollectionReleaseJson,
    type CollectionAdmissionOptions,
} from "cms-repository/collections/core/admission/admitCollectionRelease";

export * from "./texts";
