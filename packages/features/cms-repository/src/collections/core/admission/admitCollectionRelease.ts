import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import type { AdmittedCollectionRelease } from "../../interfaces/CollectionAdmission";
import type { CollectionBundleAsset } from "../../interfaces/CollectionAssets";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../limits";
import { parseCollectionRelease, parseCollectionReleaseJson } from "../parsing/parseCollectionRelease";
import { createCollectionArtifact } from "./collectionArtifact";
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
    // createCollectionArtifact snapshots every caller-owned buffer before its first hash await.
    const artifact = await createCollectionArtifact(release, assets, limits);
    await verifyCollectionRequirements(artifact.release, catalogue);
    return artifact;
}
