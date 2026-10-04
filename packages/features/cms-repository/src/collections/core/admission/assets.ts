import type {
    CollectionAssetDefinition,
    CollectionBundleAsset,
    VerifiedCollectionAsset,
} from "cms-repository/collections/interfaces/CollectionAssets";
import {
    binaryByteLength,
    binaryRepresentationFingerprint,
    mediaTypeIssue,
    sha256Digest,
    snapshotBinary,
} from "@bernouy/binary-media";
import { CollectionValidationError } from "cms-repository/collections/core/errors";
import type { CollectionLimits } from "cms-repository/collections/core/limits";
import { array, identifier, keys, ordinal, record } from "cms-repository/collections/core/values";

function mismatch(message: string, path: string): never {
    throw new CollectionValidationError("asset_mismatch", message, path);
}

function byteLength(value: Blob | Uint8Array, path: string): number {
    try {
        return binaryByteLength(value);
    } catch {
        return mismatch("asset bytes must be a Blob or Uint8Array", path);
    }
}

/** Snapshot the whole bundle synchronously, before any catalogue or hashing await. */
export function snapshotCollectionAssets(
    declarations: readonly CollectionAssetDefinition[],
    assets: readonly CollectionBundleAsset[],
    limits: Readonly<CollectionLimits>,
): readonly VerifiedCollectionAsset[] {
    const source = array(assets, limits.maxAssets, "$.assets");
    if (source.length !== declarations.length) {
        mismatch("asset set must exactly match declarations", "$.assets");
    }
    const declared = new Map(declarations.map((asset) => [asset.id, asset]));
    const seen = new Set<string>();
    let totalBytes = 0;
    const snapshots = source.map((item, index): VerifiedCollectionAsset => {
        const path = `$.assets[${index}]`;
        const asset = record(item, path);
        keys(asset, ["id", "bytes"], path);
        const id = identifier(asset.id, `${path}.id`);
        const declaration = declared.get(id);
        if (!declaration || seen.has(id)) {
            mismatch("asset set contains an undeclared or duplicate identifier", `${path}.id`);
        }
        seen.add(id);
        const value = asset.bytes;
        if (!(value instanceof Blob || value instanceof Uint8Array)) {
            mismatch("asset bytes must be a Blob or Uint8Array", `${path}.bytes`);
        }
        const size = byteLength(value, `${path}.bytes`);
        if (
            size !== declaration.byteLength ||
            size > limits.maxAssetBytes ||
            size > limits.maxBundleBytes - totalBytes
        ) {
            mismatch("asset size mismatch or byte limit exceeded", `${path}.bytes`);
        }
        totalBytes += size;
        const bytes = snapshotBinary(value);
        if (bytes.size !== declaration.byteLength) {
            mismatch("asset size mismatch", `${path}.bytes`);
        }
        return Object.freeze({ id, bytes: Object.freeze(bytes) });
    });
    return Object.freeze(snapshots.sort((left, right) => ordinal(left.id, right.id)));
}

export async function verifyCollectionAssets(
    declarations: readonly CollectionAssetDefinition[],
    snapshots: readonly VerifiedCollectionAsset[],
): Promise<void> {
    const supplied = new Map(snapshots.map((asset) => [asset.id, asset.bytes]));
    for (const declaration of declarations) {
        const path = `$.assets.${declaration.id}`;
        const bytes = supplied.get(declaration.id);
        if (!bytes || bytes.size !== declaration.byteLength) {
            mismatch("asset size mismatch or missing snapshot", path);
        }
        const content = new Uint8Array(await bytes.arrayBuffer());
        const digest = await sha256Digest(content);
        if (digest !== declaration.digest) {
            mismatch("asset digest mismatch", path);
        }
        const mediaIssue = mediaTypeIssue(declaration.mediaType, content);
        if (mediaIssue) {
            mismatch(mediaIssue, path);
        }
    }
}

/** Commits every response-relevant immutable property, not only the raw bytes. */
export function collectionAssetRepresentationVersion(asset: CollectionAssetDefinition): string {
    return binaryRepresentationFingerprint(asset);
}
