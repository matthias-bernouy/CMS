import { Binary, type Db } from "mongodb";
import { assertBlobRange, type BlobRange } from "@bernouy/blob-store";
import {
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
} from "../../../core/admission/collectionArtifact";
import { snapshotCollectionAssets, verifyCollectionAssets } from "../../../core/admission/assets";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../../../core/limits";
import { parseCollectionSiteState } from "../../core/siteState";
import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../../interfaces/store";

type ReleaseDocument = { _id: string; digest: unknown; release: unknown; state?: "pending" | "ready" };
type AssetDocument = { _id: string; digest: unknown; id: unknown; bytes: unknown };
type SiteDocument = { _id: string; revision: unknown; installations: unknown };

export class MongoCollectionStorage implements CollectionStorage {
    private readonly limits: Readonly<CollectionLimits>;

    constructor(
        private readonly db: Db,
        limits: Readonly<CollectionLimits> = DEFAULT_COLLECTION_LIMITS,
    ) {
        this.limits = normalizeCollectionLimits(limits);
    }
    async init() {
        await this.releases.createIndex(
            { "release.publisherId": 1, "release.collectionId": 1, "release.version": 1 },
            { unique: true },
        );
        await this.assets.createIndex({ digest: 1, id: 1 }, { unique: true });
    }
    private get releases() {
        return this.db.collection<ReleaseDocument>("collection_releases");
    }
    private get sites() {
        return this.db.collection<SiteDocument>("collection_installations");
    }
    private get assets() {
        return this.db.collection<AssetDocument>("collection_assets");
    }
    async putRelease(artifact: StoredCollectionRelease) {
        const verified = await verifyStoredCollectionArtifact(
            artifact.release,
            artifact.assets,
            artifact.digest,
            this.limits,
        );
        const existing = await this.releases.findOne({ _id: verified.digest });
        if (existing?.state !== "pending") {
            if (existing) {
                await this.getRelease(verified.digest);
                return;
            }
            try {
                await this.releases.insertOne({
                    _id: verified.digest,
                    digest: verified.digest,
                    release: verified.release,
                    state: "pending",
                });
            } catch (error) {
                if ((error as { code?: number }).code === 11000) {
                    throw Object.assign(new Error("Immutable collection version already exists"), { status: 409 });
                }
                throw error;
            }
        } else {
            await verifyStoredCollectionRelease(existing.release, verified.digest, this.limits);
        }
        for (const asset of verified.assets) {
            await this.assets.updateOne(
                { _id: `${verified.digest}:${asset.id}` },
                {
                    $set: {
                        digest: verified.digest,
                        id: asset.id,
                        bytes: new Binary(new Uint8Array(await asset.bytes.arrayBuffer())),
                    },
                },
                { upsert: true },
            );
        }
        const completed = await this.releases.updateOne(
            { _id: verified.digest, state: "pending" },
            { $set: { state: "ready" } },
        );
        if (completed.matchedCount !== 1) {
            if (!(await this.getRelease(verified.digest))) {
                throw new Error("Collection release staging state changed during publication");
            }
            return;
        }
        await this.getRelease(verified.digest);
    }
    async getRelease(digest: string) {
        const value = await this.releases.findOne({ _id: digest });
        if (!value || value.state === "pending") {
            return null;
        }
        if (value._id !== digest || value.digest !== digest) {
            throw new TypeError("Stored collection release identity is inconsistent");
        }
        const documents = await this.assets.find({ digest }).toArray();
        const assets = documents.map((asset) => {
            if (
                asset._id !== `${digest}:${asset.id}` ||
                typeof asset.id !== "string" ||
                !(asset.bytes instanceof Binary)
            ) {
                throw new TypeError("Stored collection asset identity is inconsistent");
            }
            return { id: asset.id, bytes: Uint8Array.from(asset.bytes.buffer) };
        });
        const verified = await verifyStoredCollectionArtifact(value.release, assets, value.digest, this.limits);
        return {
            digest: verified.digest,
            release: verified.release,
            assets: await Promise.all(
                verified.assets.map(async (asset) => ({
                    id: asset.id,
                    bytes: new Uint8Array(await asset.bytes.arrayBuffer()),
                })),
            ),
        };
    }
    async getReleaseMetadata(digest: string) {
        const value = await this.releases.findOne({ _id: digest });
        if (!value || value.state === "pending") {
            return null;
        }
        if (value._id !== digest || value.digest !== digest) {
            throw new TypeError("Stored collection release identity is inconsistent");
        }
        const verified = await verifyStoredCollectionRelease(value.release, value.digest, this.limits);
        return { digest: verified.digest, release: verified.release };
    }
    async getAsset(digest: string, assetId: string, range?: BlobRange) {
        const [artifact, document] = await Promise.all([
            this.getReleaseMetadata(digest),
            this.assets.findOne({ _id: `${digest}:${assetId}`, digest, id: assetId }),
        ]);
        const declaration = artifact?.release.assets.find((asset) => asset.id === assetId);
        if (!artifact || !declaration || !document || !(document.bytes instanceof Binary)) {
            return null;
        }
        const bytes = Uint8Array.from(document.bytes.buffer);
        const snapshots = snapshotCollectionAssets([declaration], [{ id: assetId, bytes }], this.limits);
        await verifyCollectionAssets([declaration], snapshots);
        if (!range) {
            return bytes;
        }
        assertBlobRange(range, bytes.byteLength);
        return bytes.slice(range.start, range.end + 1);
    }
    async readSite(siteId: string) {
        const value = await this.sites.findOne({ _id: siteId }, { projection: { _id: 0 } });
        return value ? parseCollectionSiteState(value) : { revision: 0, installations: [] };
    }
    async compareAndSet(siteId: string, expected: number, next: CollectionSiteState) {
        const state = parseCollectionSiteState(next);
        if (!Number.isSafeInteger(expected) || expected < 0 || state.revision !== expected + 1) {
            throw new TypeError("Invalid collection site state transition");
        }
        try {
            const result = await this.sites.replaceOne({ _id: siteId, revision: expected }, state, {
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
