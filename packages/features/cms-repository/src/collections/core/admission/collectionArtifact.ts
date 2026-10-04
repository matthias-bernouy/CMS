import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type {
    AdmittedCollectionRelease,
    CollectionDigest,
    VerifiedCollectionReleaseMetadata,
} from "../../interfaces/CollectionAdmission";
import type { CollectionBundleAsset, VerifiedCollectionAsset } from "../../interfaces/CollectionAssets";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { CollectionValidationError } from "../errors";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../limits";
import { parseCollectionRelease } from "../parsing/parseCollectionRelease";
import { snapshotCollectionAssets, verifyCollectionAssets } from "./assets";

export async function createCollectionArtifact(
    release: CollectionRelease,
    assets: readonly CollectionBundleAsset[],
    limits: Readonly<CollectionLimits>,
): Promise<AdmittedCollectionRelease> {
    const snapshots = snapshotCollectionAssets(release.assets, assets, limits);
    await verifyCollectionAssets(release.assets, snapshots);
    return sealCollectionArtifact(release, snapshots, limits);
}

/** Rebuilds persisted artifact identity without re-resolving mutable contract availability. */
export async function verifyStoredCollectionArtifact(
    value: unknown,
    assets: readonly CollectionBundleAsset[],
    expectedDigest: unknown,
    options: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS,
): Promise<AdmittedCollectionRelease> {
    const limits = normalizeCollectionLimits(options);
    const metadata = await verifyStoredCollectionRelease(value, expectedDigest, limits);
    const snapshots = snapshotCollectionAssets(metadata.release.assets, assets, limits);
    await verifyCollectionAssets(metadata.release.assets, snapshots);
    return Object.freeze({ ...metadata, assets: snapshots });
}

/** Verifies immutable release metadata without loading potentially large asset bytes. */
export async function verifyStoredCollectionRelease(
    value: unknown,
    expectedDigest: unknown,
    options: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS,
): Promise<VerifiedCollectionReleaseMetadata> {
    const limits = normalizeCollectionLimits(options);
    const release = parseCollectionRelease(value, limits);
    const artifact = await sealCollectionArtifact(release, [], limits);
    if (typeof expectedDigest !== "string" || artifact.digest !== expectedDigest) {
        throw new CollectionValidationError("asset_mismatch", "stored collection release digest mismatch", "$.digest");
    }
    const { assets: _, ...metadata } = artifact;
    return Object.freeze(metadata);
}

async function sealCollectionArtifact(
    release: CollectionRelease,
    assets: readonly VerifiedCollectionAsset[],
    limits: Readonly<CollectionLimits>,
): Promise<AdmittedCollectionRelease> {
    const canonicalJson = canonicalizeIJson(release, limits.maxJsonDepth);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson)));
    const digest =
        `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as CollectionDigest;
    return Object.freeze({ kind: "admitted-collection-release", release, digest, canonicalJson, assets });
}
