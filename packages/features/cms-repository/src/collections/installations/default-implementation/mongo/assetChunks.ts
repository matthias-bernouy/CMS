import { Binary, type Collection } from "mongodb";
import { sha256Digest } from "@bernouy/binary-media";
import type { BlobRange } from "@bernouy/blob-store";
import type { CollectionAssetDefinition } from "../../../interfaces/CollectionAssets";
import { assertMongoBsonDocumentSize } from "./bsonSize";

export const COLLECTION_ASSET_CHUNK_BYTES = 256 * 1024;

export type AssetChunkDocument = {
    _id: string;
    digest: unknown;
    id: unknown;
    index: unknown;
    byteLength: unknown;
    chunkDigest: unknown;
    bytes: unknown;
};

export async function storeAssetChunks(
    collection: Collection<AssetChunkDocument>,
    releaseDigest: string,
    assetId: string,
    bytes: Uint8Array,
): Promise<void> {
    const count = chunkCount(bytes.byteLength);
    for (let index = 0; index < count; index++) {
        const chunk = bytes.slice(index * COLLECTION_ASSET_CHUNK_BYTES, (index + 1) * COLLECTION_ASSET_CHUNK_BYTES);
        const document: AssetChunkDocument = {
            _id: chunkId(releaseDigest, assetId, index),
            digest: releaseDigest,
            id: assetId,
            index,
            byteLength: chunk.byteLength,
            chunkDigest: await sha256Digest(chunk),
            bytes: new Binary(chunk),
        };
        assertMongoBsonDocumentSize(document, "Collection asset chunk");
        const { _id, ...contents } = document;
        await collection.updateOne({ _id }, { $set: contents }, { upsert: true });
    }
}

export async function readAssetChunks(
    collection: Collection<AssetChunkDocument>,
    releaseDigest: string,
    declaration: CollectionAssetDefinition,
    range?: BlobRange,
): Promise<Uint8Array | null> {
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, declaration.byteLength - 1);
    const first = Math.floor(start / COLLECTION_ASSET_CHUNK_BYTES);
    const last = declaration.byteLength === 0 ? 0 : Math.floor(end / COLLECTION_ASSET_CHUNK_BYTES);
    const documents = await Promise.all(
        Array.from({ length: last - first + 1 }, (_, offset) => {
            const index = first + offset;
            return collection.findOne({
                _id: chunkId(releaseDigest, declaration.id, index),
                digest: releaseDigest,
                id: declaration.id,
                index,
            });
        }),
    );
    const result = new Uint8Array(range ? range.end - range.start + 1 : declaration.byteLength);
    for (let offset = 0; offset < documents.length; offset++) {
        const index = first + offset;
        const bytes = await verifiedChunk(documents[offset] ?? null, releaseDigest, declaration, index);
        if (!bytes) {
            return null;
        }
        const absoluteStart = index * COLLECTION_ASSET_CHUNK_BYTES;
        const copyStart = Math.max(start, absoluteStart);
        const copyEnd = Math.min(range ? range.end + 1 : declaration.byteLength, absoluteStart + bytes.byteLength);
        result.set(bytes.subarray(copyStart - absoluteStart, copyEnd - absoluteStart), copyStart - start);
    }
    return result;
}

async function verifiedChunk(
    value: AssetChunkDocument | null,
    releaseDigest: string,
    declaration: CollectionAssetDefinition,
    index: number,
): Promise<Uint8Array | null> {
    if (!value) {
        return null;
    }
    const expectedLength = chunkByteLength(declaration.byteLength, index);
    if (
        value._id !== chunkId(releaseDigest, declaration.id, index) ||
        value.digest !== releaseDigest ||
        value.id !== declaration.id ||
        value.index !== index ||
        value.byteLength !== expectedLength ||
        typeof value.chunkDigest !== "string" ||
        !(value.bytes instanceof Binary)
    ) {
        throw new TypeError("Stored collection asset chunk identity is inconsistent");
    }
    const bytes = Uint8Array.from(value.bytes.buffer);
    if (bytes.byteLength !== expectedLength || (await sha256Digest(bytes)) !== value.chunkDigest) {
        throw new TypeError("Stored collection asset chunk digest mismatch");
    }
    return bytes;
}

function chunkId(releaseDigest: string, assetId: string, index: number): string {
    return `${releaseDigest}:${assetId}:${index}`;
}

function chunkCount(byteLength: number): number {
    return Math.max(1, Math.ceil(byteLength / COLLECTION_ASSET_CHUNK_BYTES));
}

function chunkByteLength(byteLength: number, index: number): number {
    const remaining = byteLength - index * COLLECTION_ASSET_CHUNK_BYTES;
    return Math.max(0, Math.min(COLLECTION_ASSET_CHUNK_BYTES, remaining));
}
