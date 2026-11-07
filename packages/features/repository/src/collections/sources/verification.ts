import type { CollectionBundleAsset } from "../interfaces/CollectionAssets";
import type { AdmittedCollectionRelease, VerifiedCollectionReleaseMetadata } from "../interfaces/CollectionAdmission";
import type { CollectionRelease } from "../interfaces/CollectionRelease";
import { verifyStoredCollectionArtifact, verifyStoredCollectionRelease } from "../core/admission/collectionArtifact";
import type { CollectionLimits } from "../core/limits";
import { verifyCollectionPublicationEvolution } from "../core/admission/evolution";

/** Pure validation only; runtime composition may move these computations off the request thread. */
export interface CollectionVerifier {
    metadata(
        value: unknown,
        digest: unknown,
        signal?: AbortSignal,
        limits?: Readonly<CollectionLimits>,
    ): Promise<VerifiedCollectionReleaseMetadata>;
    artifact(
        value: unknown,
        assets: readonly CollectionBundleAsset[],
        digest: unknown,
        signal?: AbortSignal,
        limits?: Readonly<CollectionLimits>,
    ): Promise<AdmittedCollectionRelease>;
    evolution(previous: CollectionRelease, next: CollectionRelease, signal?: AbortSignal): Promise<void>;
}

export const inlineCollectionVerifier: CollectionVerifier = {
    metadata: (value, digest, _signal, limits) => verifyStoredCollectionRelease(value, digest, limits),
    artifact: (value, assets, digest, _signal, limits) => verifyStoredCollectionArtifact(value, assets, digest, limits),
    evolution: (previous, next) => verifyCollectionPublicationEvolution(previous, next),
};
