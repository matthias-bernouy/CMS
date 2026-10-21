import type { Db } from "mongodb";
import { assertBlobRange, type BlobRange } from "@bernouy/blob-store";
import {
    verifyStoredCollectionArtifact,
    verifyStoredCollectionRelease,
} from "../../../core/admission/collectionArtifact";
import { parseAssets } from "../../../core/parsing/assets";
import { DEFAULT_COLLECTION_LIMITS, normalizeCollectionLimits, type CollectionLimits } from "../../../core/limits";
import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import { parseCollectionSiteState } from "../../core/siteState";
import type { CollectionStorage, CollectionSiteState, StoredCollectionRelease } from "../../interfaces/store";
import { readAssetChunks, storeAssetChunks, type AssetChunkDocument } from "./assetChunks";
import { assertMongoBsonDocumentSize } from "./bsonSize";

type ReleaseDocument = {
    _id: string;
    digest: unknown;
    release: unknown;
    assetManifest?: unknown;
    state?: "pending" | "ready";
};
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
        await this.assets.createIndex({ digest: 1, id: 1, index: 1 }, { unique: true });
        await this.reconcilePendingReleases();
    }
    private get releases() {
        return this.db.collection<ReleaseDocument>("collection_releases");
    }
    private get sites() {
        return this.db.collection<SiteDocument>("collection_installations");
    }
    private get assets() {
        return this.db.collection<AssetChunkDocument>("collection_asset_chunks");
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
                const pending: ReleaseDocument = {
                    _id: verified.digest,
                    digest: verified.digest,
                    release: verified.release,
                    assetManifest: assetManifest(verified.release),
                    state: "pending",
                };
                assertMongoBsonDocumentSize(pending, "Collection release");
                await this.releases.insertOne(pending);
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
            await storeAssetChunks(
                this.assets,
                verified.digest,
                asset.id,
                new Uint8Array(await asset.bytes.arrayBuffer()),
            );
        }
        const completed = await this.releases.updateOne(
            { _id: verified.digest, state: "pending" },
            { $set: { state: "ready", assetManifest: assetManifest(verified.release) } },
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
        const metadata = await this.getReleaseMetadata(digest);
        if (!metadata) {
            return null;
        }
        const assets = await Promise.all(
            metadata.release.assets.map(async (declaration) => {
                const bytes = await readAssetChunks(this.assets, digest, declaration);
                if (!bytes) {
                    throw new TypeError(`Stored collection asset is incomplete: ${declaration.id}`);
                }
                return { id: declaration.id, bytes };
            }),
        );
        const verified = await verifyStoredCollectionArtifact(metadata.release, assets, metadata.digest, this.limits);
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
        assertStoredDocumentIdentity(value, digest);
        assertStoredReleaseShape(value.release);
        return { digest, release: structuredClone(value.release as CollectionRelease) };
    }
    async getAssetManifest(digest: string) {
        const value = await this.releases.findOne(
            { _id: digest },
            { projection: { _id: 1, digest: 1, assetManifest: 1, state: 1 } },
        );
        if (!value || value.state === "pending") {
            return null;
        }
        assertStoredDocumentIdentity(value, digest);
        if (!isRecord(value.assetManifest) || typeof value.assetManifest.collectionId !== "string") {
            throw new TypeError("Stored collection asset manifest is inconsistent");
        }
        return {
            digest,
            collectionId: value.assetManifest.collectionId,
            assets: parseAssets(value.assetManifest.assets, this.limits),
        };
    }
    async getAsset(digest: string, assetId: string, range?: BlobRange) {
        const manifest = await this.getAssetManifest(digest);
        const declaration = manifest?.assets.find((asset) => asset.id === assetId);
        if (!manifest || !declaration) {
            return null;
        }
        if (range) {
            assertBlobRange(range, declaration.byteLength);
        }
        return readAssetChunks(this.assets, digest, declaration, range);
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
        assertMongoBsonDocumentSize({ _id: siteId, ...state }, "Collection site state");
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

    private async reconcilePendingReleases(): Promise<void> {
        const pending = await this.releases.find({ state: "pending" }).toArray();
        for (const document of pending) {
            const digest = typeof document.digest === "string" ? document.digest : document._id;
            try {
                const metadata = await verifyStoredCollectionRelease(document.release, digest, this.limits);
                const assets: { id: string; bytes: Uint8Array }[] = [];
                let complete = true;
                for (const declaration of metadata.release.assets) {
                    const bytes = await readAssetChunks(this.assets, digest, declaration);
                    if (!bytes) {
                        complete = false;
                        break;
                    }
                    assets.push({ id: declaration.id, bytes });
                }
                if (complete) {
                    await verifyStoredCollectionArtifact(metadata.release, assets, digest, this.limits);
                    await this.releases.updateOne(
                        { _id: document._id, state: "pending" },
                        { $set: { state: "ready", assetManifest: assetManifest(metadata.release) } },
                    );
                    continue;
                }
            } catch (error) {
                if (!(error instanceof TypeError)) {
                    throw error;
                }
            }
            await this.assets.deleteMany({ digest });
            await this.releases.deleteOne({ _id: document._id, state: "pending" });
        }
    }
}

function assetManifest(release: CollectionRelease) {
    return { collectionId: release.collectionId, assets: release.assets };
}

function assertStoredDocumentIdentity(value: ReleaseDocument, digest: string): void {
    if (value._id !== digest || value.digest !== digest) {
        throw new TypeError("Stored collection release identity is inconsistent");
    }
}

function assertStoredReleaseShape(value: unknown): void {
    if (
        !isRecord(value) ||
        value.kind !== "collection" ||
        value.protocol !== "ulvia-collection/v1" ||
        value.schemaDialect !== "ulvia-schema/v1"
    ) {
        throw new TypeError("Stored collection release is inconsistent");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
