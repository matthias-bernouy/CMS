import type {
    CollectionAssetDefinition,
    CollectionBundleAsset,
    VerifiedCollectionAsset,
} from "../interfaces/CollectionAssets";
import type { AdmittedCollectionRelease, VerifiedCollectionReleaseMetadata } from "../interfaces/CollectionAdmission";
import type { CollectionRelease } from "../interfaces/CollectionRelease";
import {
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
    verifyStoredCollectionReleaseJson,
} from "../core/admission/collectionArtifact";
import type { CollectionLimits } from "../core/limits";
import { verifyCollectionPublicationEvolution } from "../core/admission/evolution";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits } from "../core/limits";
import { snapshotCollectionAssets, verifyCollectionAssets } from "../core/admission/assets";

/** Pure validation only; runtime composition may move these computations off the request thread. */
export interface CollectionVerifier {
    /** Verify bytes against already-validated immutable declarations; this alone never admits a release. */
    assets?(
        declarations: readonly CollectionAssetDefinition[],
        assets: readonly CollectionBundleAsset[],
        signal?: AbortSignal,
        limits?: Readonly<CollectionLimits>,
    ): Promise<readonly VerifiedCollectionAsset[]>;
    metadataJson(
        value: string | Uint8Array,
        digest: unknown,
        signal?: AbortSignal,
        limits?: Readonly<CollectionLimits>,
    ): Promise<VerifiedCollectionReleaseMetadata>;
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
    async assets(declarations, assets, signal, limits) {
        signal?.throwIfAborted();
        const snapshots = snapshotCollectionAssets(
            declarations,
            assets,
            normalizeCollectionLimits(limits ?? DEFAULT_COLLECTION_LIMITS),
        );
        await verifyCollectionAssets(declarations, snapshots, signal);
        signal?.throwIfAborted();
        return snapshots;
    },
    metadataJson: (value, digest, _signal, limits) => verifyStoredCollectionReleaseJson(value, digest, limits),
    metadata: (value, digest, _signal, limits) => verifyStoredCollectionRelease(value, digest, limits),
    artifact: (value, assets, digest, _signal, limits) => verifyStoredCollectionArtifact(value, assets, digest, limits),
    evolution: (previous, next) => verifyCollectionPublicationEvolution(previous, next),
};
