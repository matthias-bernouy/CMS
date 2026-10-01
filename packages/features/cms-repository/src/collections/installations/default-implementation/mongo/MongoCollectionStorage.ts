import { Binary, type Db } from "mongodb";
import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../../interfaces/store";
export class MongoCollectionStorage implements CollectionStorage {
    constructor(private readonly db: Db) {}
    async init() {
        await this.releases.createIndex(
            { "release.publisherId": 1, "release.collectionId": 1, "release.version": 1 },
            { unique: true },
        );
        await this.assets.createIndex({ digest: 1, id: 1 }, { unique: true });
    }
    private get releases() {
        return this.db.collection<StoredCollectionRelease & { _id: string }>("collection_releases");
    }
    private get sites() {
        return this.db.collection<CollectionSiteState & { _id: string }>("collection_installations");
    }
    private get assets() {
        return this.db.collection<{ _id: string; digest: string; id: string; bytes: Binary }>("collection_assets");
    }
    async putRelease(artifact: StoredCollectionRelease) {
        for (const asset of artifact.assets) {
            await this.assets.updateOne(
                { _id: `${artifact.digest}:${asset.id}` },
                {
                    $setOnInsert: {
                        digest: artifact.digest,
                        id: asset.id,
                        bytes: new Binary(asset.bytes),
                    },
                },
                { upsert: true },
            );
        }
        try {
            await this.releases.updateOne(
                { _id: artifact.digest },
                { $setOnInsert: { digest: artifact.digest, release: artifact.release } },
                { upsert: true },
            );
        } catch (error) {
            if ((error as { code?: number }).code === 11000) {
                throw Object.assign(new Error("Immutable collection version already exists"), { status: 409 });
            }
            throw error;
        }
    }
    async getRelease(digest: string) {
        const value = await this.releases.findOne({ _id: digest }, { projection: { _id: 0 } });
        return value ? { digest: value.digest, release: value.release, assets: [] } : null;
    }
    async getAsset(digest: string, assetId: string) {
        const value = await this.assets.findOne({ digest, id: assetId });
        return value ? Uint8Array.from(value.bytes.buffer) : null;
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
