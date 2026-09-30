import type { Db } from "mongodb";
import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../interfaces/store";
export class MongoCollectionStorage implements CollectionStorage {
    constructor(private readonly db: Db) {}
    async init() {
        await this.releases.createIndex(
            { "release.publisherId": 1, "release.collectionId": 1, "release.version": 1 },
            { unique: true },
        );
    }
    private get releases() {
        return this.db.collection<StoredCollectionRelease & { _id: string }>("collection_releases");
    }
    private get sites() {
        return this.db.collection<CollectionSiteState & { _id: string }>("collection_installations");
    }
    async putRelease(artifact: StoredCollectionRelease) {
        try {
            await this.releases.updateOne({ _id: artifact.digest }, { $setOnInsert: artifact }, { upsert: true });
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                throw Object.assign(new Error("Immutable collection version already exists"), { status: 409 });
            }
            throw error;
        }
    }
    async getRelease(digest: string) {
        const value = await this.releases.findOne({ _id: digest }, { projection: { _id: 0 } });
        return value ? { digest: value.digest, release: value.release } : null;
    }
    async readSite(siteId: string) {
        const value = await this.sites.findOne({ _id: siteId });
        return value
            ? { revision: value.revision, installations: value.installations }
            : { revision: 0, installations: [] };
    }
    async compareAndSet(siteId: string, expected: number, next: CollectionSiteState) {
        try {
            const result = await this.sites.replaceOne({ _id: siteId, revision: expected }, next, {
                upsert: expected === 0,
            });
            return result.modifiedCount === 1 || result.upsertedCount === 1;
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                return false;
            }
            throw error;
        }
    }
}
