import type { ResourceAssetMetadata, ResourceAssetReference, ResourceTextRecord } from "resources/storage/records";

/** Host-scoped ordinary entity persistence, never an installed archive/release catalogue. */
export interface ResourceMetadataStore {
    readonly scopeId: string;
    isEmpty(): Promise<boolean>;
    readAssets(references: readonly ResourceAssetReference[]): Promise<readonly ResourceAssetMetadata[]>;
    createAsset(metadata: ResourceAssetMetadata): Promise<void>;
    readTexts(): Promise<readonly ResourceTextRecord[]>;
    getTexts(namespace: string): Promise<ResourceTextRecord | null>;
    createTexts(record: ResourceTextRecord): Promise<void>;
    replaceTexts(record: ResourceTextRecord, expectedRevision: string): Promise<void>;
}
export interface ResourceTextSnapshot {
    readonly revision: string;
    readonly sources: readonly ResourceTextRecord[];
}
