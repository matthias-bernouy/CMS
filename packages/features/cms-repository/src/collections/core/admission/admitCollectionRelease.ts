import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { canonicalizeIJson } from "cms-repository/exports/contracts/protocol";
import type { AdmittedCollectionRelease, CollectionDigest } from "../../interfaces/CollectionAdmission";
import type { CollectionBundleAsset } from "../../interfaces/CollectionAssets";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../limits";
import { parseCollectionRelease, parseCollectionReleaseJson } from "../parsing/parseCollectionRelease";
import { snapshotCollectionAssets, verifyCollectionAssets } from "./assets";
import { verifyCollectionRequirements } from "./requirements";

export interface CollectionAdmissionOptions {
    readonly limits?: Readonly<CollectionLimits>;
    readonly contracts?: ReleaseCatalogue;
}

export async function admitCollectionRelease(
    value: unknown,
    assets: readonly CollectionBundleAsset[] = [],
    options: CollectionAdmissionOptions = {},
): Promise<AdmittedCollectionRelease> {
    const limits = normalizeCollectionLimits(options.limits ?? DEFAULT_COLLECTION_LIMITS);
    return admitParsed(parseCollectionRelease(value, limits), assets, options.contracts, limits);
}

export async function admitCollectionReleaseJson(
    input: string | Uint8Array,
    assets: readonly CollectionBundleAsset[] = [],
    options: CollectionAdmissionOptions = {},
): Promise<AdmittedCollectionRelease> {
    const limits = normalizeCollectionLimits(options.limits ?? DEFAULT_COLLECTION_LIMITS);
    return admitParsed(parseCollectionReleaseJson(input, limits), assets, options.contracts, limits);
}

async function admitParsed(
    release: CollectionRelease,
    assets: readonly CollectionBundleAsset[],
    catalogue: ReleaseCatalogue | undefined,
    limits: Readonly<CollectionLimits>,
): Promise<AdmittedCollectionRelease> {
    // Snapshot every caller-owned buffer before the first asynchronous dependency or hash operation.
    const snapshots = snapshotCollectionAssets(release.assets, assets, limits);
    await verifyCollectionAssets(release.assets, snapshots);
    await verifyCollectionRequirements(release, catalogue);
    const canonicalJson = canonicalizeIJson(release, limits.maxJsonDepth);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson)));
    const digest =
        `sha256:${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as CollectionDigest;
    return Object.freeze({ kind: "admitted-collection-release", release, digest, canonicalJson, assets: snapshots });
}
