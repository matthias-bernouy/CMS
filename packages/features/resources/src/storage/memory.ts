import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceMetadataStore } from "resources/interfaces/entities";
import {
    assertResourceScope,
    assetReferences,
    readAssetMetadata,
    readTextRecord,
    ResourceConflictError,
} from "./records";
import type { ResourceAssetMetadata, ResourceAssetReference, ResourceTextRecord } from "./records";

/** Explicitly composed for disposable previews and tests. */
export class MemoryResourceMetadataStore implements ResourceMetadataStore {
    private readonly assets = new Map<string, ResourceAssetMetadata>();
    private readonly texts = new Map<string, ResourceTextRecord>();
    constructor(readonly scopeId: string) {
        assertResourceScope(scopeId);
    }
    async isEmpty() {
        return this.assets.size === 0 && this.texts.size === 0;
    }
    async readAssets(input: readonly ResourceAssetReference[]) {
        return assetReferences(input).flatMap((ref) => {
            const asset = this.assets.get(JSON.stringify([ref.namespace, ref.id]));
            return asset ? [readAssetMetadata(asset)] : [];
        });
    }
    async createAsset(input: ResourceAssetMetadata): Promise<void> {
        const asset = readAssetMetadata(input);
        const key = JSON.stringify([asset.namespace, asset.id]);
        const current = this.assets.get(key);
        if (current && canonicalizeIJson(current) !== canonicalizeIJson(asset)) {
            throw new ResourceConflictError("Resource asset identity already exists");
        }
        if (!current && this.assets.size >= 512) {
            throw new ResourceConflictError("Resource asset budget exhausted");
        }
        this.assets.set(key, asset);
    }
    async readTexts() {
        return [...this.texts.values()].map(readTextRecord);
    }
    async getTexts(namespace: string) {
        const row = this.texts.get(namespace);
        return row ? readTextRecord(row) : null;
    }
    async createTexts(input: ResourceTextRecord): Promise<void> {
        const record = readTextRecord(input);
        const current = this.texts.get(record.source.namespace);
        if (current && current.revision !== record.revision) {
            throw new ResourceConflictError("Resource text namespace already exists");
        }
        if (!current && this.texts.size >= 32) {
            throw new ResourceConflictError("Resource text namespace budget exhausted");
        }
        this.texts.set(record.source.namespace, record);
    }
    async replaceTexts(input: ResourceTextRecord, expectedRevision: string): Promise<void> {
        const record = readTextRecord(input);
        if (this.texts.get(record.source.namespace)?.revision !== expectedRevision) {
            throw new ResourceConflictError("Resource text revision changed");
        }
        this.texts.set(record.source.namespace, record);
    }
}
