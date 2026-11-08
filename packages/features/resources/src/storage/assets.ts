import { binaryByteLength, snapshotBinary, sha256Digest, mediaTypeIssue } from "@bernouy/binary-media";
import { assertBlobRange } from "@bernouy/blob-store";
import type { BlobStore, BlobRange } from "@bernouy/blob-store";
import { parseInlineSvgAsset } from "@bernouy/content/page-document";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceMetadataStore } from "resources/interfaces/entities";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";
import {
    readAssetMetadata,
    assetReferences,
    resourceEntityId,
    ResourceConflictError,
    assertResourceScope,
} from "./records";
import type { ResourceAssetMetadata, ResourceAssetReference } from "./records";

/** Ordinary immutable resource files, independent of the input ZIP after import. */
export class ResourceAssets {
    private readonly scopeId: string;
    constructor(
        private readonly metadata: ResourceMetadataStore,
        private readonly blobs: BlobStore,
    ) {
        this.scopeId = metadata.scopeId;
        assertResourceScope(this.scopeId);
    }
    async getMetadata(input: readonly ResourceAssetReference[]) {
        const refs = assetReferences(input);
        const expected = new Set(refs.map((ref) => JSON.stringify([ref.namespace, ref.id])));
        const seen = new Set<string>();
        const rows = await this.metadata.readAssets(refs);
        const assets = rows.map((value) => {
            const asset = readAssetMetadata(value);
            const id = JSON.stringify([asset.namespace, asset.id]);
            if (!expected.has(id) || seen.has(id)) {
                throw new ResourceArchiveError("Resource metadata returned an unexpected identity");
            }
            seen.add(id);
            return asset;
        });
        return Object.freeze(assets);
    }
    private key(digest: string): string {
        return `resources/${resourceEntityId(this.scopeId, "asset", digest)}`;
    }
    async putExact(input: ResourceAssetMetadata, bytes: Uint8Array, signal?: AbortSignal): Promise<void> {
        signal?.throwIfAborted();
        const asset = readAssetMetadata(input);
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError("Resource asset persistence requires captured byte arrays");
        }
        if (binaryByteLength(bytes) !== asset.byteLength) {
            throw new ResourceArchiveError("Resource asset size mismatch");
        }
        const snapshot = snapshotBinary(bytes);
        const content = new Uint8Array(await snapshot.arrayBuffer());
        signal?.throwIfAborted();
        if ((await sha256Digest(content)) !== asset.digest || mediaTypeIssue(asset.mediaType, content)) {
            throw new ResourceArchiveError("Resource asset digest or signature mismatch");
        }
        if (asset.profiles?.includes("inline-svg")) {
            parseInlineSvgAsset(content);
        }
        const current = (await this.getMetadata([{ namespace: asset.namespace, id: asset.id }]))[0];
        if (current) {
            if (canonicalizeIJson(current) !== canonicalizeIJson(asset)) {
                throw new ResourceConflictError("Resource asset identity already exists");
            }
            if ((await this.blobs.head(this.key(asset.digest)))?.size !== asset.byteLength) {
                throw new ResourceArchiveError("Stored resource asset is missing or inconsistent");
            }
            return;
        }
        signal?.throwIfAborted();
        const stored = await this.blobs.put(this.key(asset.digest), new Blob([content]));
        signal?.throwIfAborted();
        if (stored.size !== asset.byteLength) {
            throw new ResourceArchiveError("Stored resource asset size mismatch");
        }
        signal?.throwIfAborted();
        await this.metadata.createAsset(asset);
    }
    async read(reference: ResourceAssetReference, range?: BlobRange) {
        const asset = (await this.getMetadata([reference]))[0];
        if (!asset) {
            return null;
        }
        if (range) {
            assertBlobRange(range, asset.byteLength);
        }
        const key = this.key(asset.digest);
        if ((await this.blobs.head(key))?.size !== asset.byteLength) {
            throw new ResourceArchiveError("Stored resource asset is missing or inconsistent");
        }
        const stream = await this.blobs.get(key, range ? { range } : undefined);
        if (!stream) {
            throw new ResourceArchiveError("Stored resource asset is missing");
        }
        return { metadata: asset, stream };
    }
}
