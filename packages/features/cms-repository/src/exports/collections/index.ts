export type {
    CollectionRelease,
    CollectionConfiguration,
    CollectionCapabilityRequirement,
} from "cms-repository/collections/interfaces/CollectionRelease";
export type {
    CollectionBloc,
    CollectionComponent,
    CollectionComposition,
    CollectionSlot,
} from "cms-repository/collections/interfaces/CollectionBloc";
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
    parseCollectionRelease,
    parseCollectionReleaseJson,
} from "cms-repository/collections/core/parsing/parseCollectionRelease";
export {
    admitCollectionRelease,
    admitCollectionReleaseJson,
    type CollectionAdmissionOptions,
} from "cms-repository/collections/core/admission/admitCollectionRelease";

export * from "./texts";
