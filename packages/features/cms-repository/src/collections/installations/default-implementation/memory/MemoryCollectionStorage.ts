import { verifyStoredCollectionArtifact } from "../../../core/admission/collectionArtifact";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../../../core/limits";
import { parseCollectionSiteState } from "../../core/siteState";
import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../../interfaces/store";
export class MemoryCollectionStorage implements CollectionStorage {
    private readonly releases = new Map<string, StoredCollectionRelease>();
    private readonly sites = new Map<string, CollectionSiteState>();
    private readonly limits: Readonly<CollectionLimits>;

    constructor(limits: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS) {
        this.limits = normalizeCollectionLimits(limits);
    }

    async putRelease(artifact: StoredCollectionRelease) {
        const verified = await verifyStoredCollectionArtifact(
            artifact.release,
            artifact.assets,
            artifact.digest,
            this.limits,
        );
        const previous = [...this.releases.values()].find(
            ({ release }) =>
                release.collectionId === verified.release.collectionId &&
                release.publisherId === verified.release.publisherId &&
                release.version === verified.release.version,
        );
        if (previous && previous.digest !== verified.digest) {
            throw Object.assign(new Error("Immutable collection version already exists"), { status: 409 });
        }
        this.releases.set(verified.digest, {
            digest: verified.digest,
            release: verified.release,
            assets: await Promise.all(
                verified.assets.map(async (asset) => ({
                    id: asset.id,
                    bytes: new Uint8Array(await asset.bytes.arrayBuffer()),
                })),
            ),
        });
    }
    async getRelease(digest: string) {
        return structuredClone(this.releases.get(digest) ?? null);
    }
    async getAsset(digest: string, assetId: string) {
        const asset = this.releases.get(digest)?.assets.find((item) => item.id === assetId);
        return asset ? new Uint8Array(asset.bytes) : null;
    }
    async readSite(siteId: string) {
        return structuredClone(this.sites.get(siteId) ?? { revision: 0, installations: [] });
    }
    async compareAndSet(siteId: string, expected: number, next: CollectionSiteState) {
        const state = parseCollectionSiteState(next);
        if (!Number.isSafeInteger(expected) || expected < 0 || state.revision !== expected + 1) {
            throw new TypeError("Invalid collection site state transition");
        }
        if ((this.sites.get(siteId)?.revision ?? 0) !== expected) {
            return false;
        }
        this.sites.set(siteId, state);
        return true;
    }
}
