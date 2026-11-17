import { canonicalizeIJson, deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits } from "../core/limits";
import type { CollectionLimits } from "../core/limits";
import type { VerifiedCollectionReleaseMetadata } from "../interfaces/CollectionAdmission";
import { snapshotCollectionAssets, verifyCollectionAssets } from "../core/admission/assets";
import type { CollectionVerifier } from "./verification";
import { assertCollectionResourceIsolation } from "../installations/core/resourceIsolation";

/** One preparation owns this evidence. Only immutable verifier outputs are reusable, never caller DTOs or digests alone. */
export function collectionVerificationScope(
    base: CollectionVerifier,
    maxEntries: number,
    maxBytes: number,
): CollectionVerifier & { validateResources: typeof assertCollectionResourceIsolation } {
    const known = new WeakMap<object, Map<string, VerifiedCollectionReleaseMetadata>>();
    const graphs = new Set<string>();
    let entries = 0;
    let bytes = 0;
    const key = (limits?: Readonly<CollectionLimits>) =>
        canonicalizeIJson(normalizeCollectionLimits(limits ?? DEFAULT_COLLECTION_LIMITS));
    const remember = (metadata: VerifiedCollectionReleaseMetadata, limits?: Readonly<CollectionLimits>) => {
        const identity = key(limits);
        const records = known.get(metadata.release) ?? new Map<string, VerifiedCollectionReleaseMetadata>();
        if (!records.has(identity)) {
            const size = new TextEncoder().encode(metadata.canonicalJson).byteLength;
            if (entries < maxEntries && size <= maxBytes - bytes) {
                records.set(identity, deepFreeze(metadata));
                known.set(metadata.release, records);
                entries++;
                bytes += size;
            }
        }
        return metadata;
    };
    const find = (value: unknown, digest: unknown, limits?: Readonly<CollectionLimits>) => {
        const metadata = value && typeof value === "object" ? known.get(value)?.get(key(limits)) : undefined;
        return metadata?.digest === digest ? metadata : undefined;
    };
    return {
        validateResources(releases) {
            const proofs = releases.map((release) => known.get(release)?.values().next().value);
            const identity = proofs.every((proof) => proof !== undefined)
                ? canonicalizeIJson(proofs.map((proof) => proof!.digest).sort())
                : undefined;
            if (identity && graphs.has(identity)) {
                return;
            }
            // A closed singleton has no cross-release rules to resolve. Admission
            // already checked its unique resources, local uses, examples, states,
            // theme references and SVG declarations against this exact immutable object.
            if (identity && releases.length === 1 && !releases[0]!.dependencies?.length) {
                return;
            }
            assertCollectionResourceIsolation(releases);
            if (identity && graphs.size < maxEntries) {
                graphs.add(identity);
            }
        },
        async metadataJson(value, digest, signal, limits) {
            signal?.throwIfAborted();
            return remember(await base.metadataJson(value, digest, signal, limits), limits);
        },
        async metadata(value, digest, signal, limits) {
            signal?.throwIfAborted();
            return find(value, digest, limits) ?? remember(await base.metadata(value, digest, signal, limits), limits);
        },
        async artifact(value, assets, digest, signal, limits) {
            signal?.throwIfAborted();
            const metadata = find(value, digest, limits);
            if (!metadata) {
                const artifact = await base.artifact(value, assets, digest, signal, limits);
                const { assets: _assets, ...evidence } = artifact;
                remember(evidence, limits);
                return artifact;
            }
            const snapshots = snapshotCollectionAssets(
                metadata.release.assets,
                assets,
                normalizeCollectionLimits(limits ?? DEFAULT_COLLECTION_LIMITS),
            );
            const verified = base.assets
                ? await base.assets(metadata.release.assets, snapshots, signal, limits)
                : snapshots;
            if (!base.assets) {
                await verifyCollectionAssets(metadata.release.assets, snapshots, signal);
            }
            signal?.throwIfAborted();
            return Object.freeze({ ...metadata, assets: verified });
        },
        evolution: (previous, next, signal) => base.evolution(previous, next, signal),
    };
}
