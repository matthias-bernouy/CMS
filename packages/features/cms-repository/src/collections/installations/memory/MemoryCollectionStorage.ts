import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../interfaces/store";
export class MemoryCollectionStorage implements CollectionStorage {
    private readonly releases = new Map<string, StoredCollectionRelease>();
    private readonly sites = new Map<string, CollectionSiteState>();
    async putRelease(artifact: StoredCollectionRelease) {
        const previous = [...this.releases.values()].find(
            ({ release }) =>
                release.collectionId === artifact.release.collectionId &&
                release.publisherId === artifact.release.publisherId &&
                release.version === artifact.release.version,
        );
        if (previous && previous.digest !== artifact.digest) {
            throw Object.assign(new Error("Immutable collection version already exists"), { status: 409 });
        }
        this.releases.set(artifact.digest, structuredClone(artifact));
    }
    async getRelease(digest: string) {
        return structuredClone(this.releases.get(digest) ?? null);
    }
    async readSite(siteId: string) {
        return structuredClone(this.sites.get(siteId) ?? { revision: 0, installations: [] });
    }
    async compareAndSet(siteId: string, expected: number, next: CollectionSiteState) {
        if ((this.sites.get(siteId)?.revision ?? 0) !== expected) {
            return false;
        }
        this.sites.set(siteId, structuredClone(next));
        return true;
    }
}
