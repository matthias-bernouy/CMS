import type { ResourceAssetMetadata, ResourceTextRecord } from "resources/storage/records";
import { readAssetMetadata, readTextRecord, resourceEntityId } from "resources/storage/records";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";

type EntityHeader = { _id: string; protocol: "ulvia-resource-entity/v1"; scopeId: string };
export type AssetDocument = EntityHeader & { kind: "asset"; asset: ResourceAssetMetadata };
export type TextDocument = EntityHeader & { kind: "texts"; record: ResourceTextRecord };
export type ResourceEntityDocument = AssetDocument | TextDocument;
export function assetDocument(scopeId: string, input: ResourceAssetMetadata): AssetDocument {
    const asset = readAssetMetadata(input);
    return {
        _id: resourceEntityId(scopeId, "asset", asset.namespace, asset.id),
        protocol: "ulvia-resource-entity/v1",
        scopeId,
        kind: "asset",
        asset,
    };
}
export function textDocument(scopeId: string, input: ResourceTextRecord): TextDocument {
    const record = readTextRecord(input);
    return {
        _id: resourceEntityId(scopeId, "texts", record.source.namespace),
        protocol: "ulvia-resource-entity/v1",
        scopeId,
        kind: "texts",
        record,
    };
}
export function readAssetDocument(scopeId: string, row: ResourceEntityDocument): ResourceAssetMetadata {
    if (row.kind !== "asset" || row.protocol !== "ulvia-resource-entity/v1" || row.scopeId !== scopeId) {
        throw new ResourceArchiveError("Invalid stored resource asset scope or protocol");
    }
    const asset = readAssetMetadata(row.asset);
    if (row._id !== resourceEntityId(scopeId, "asset", asset.namespace, asset.id)) {
        throw new ResourceArchiveError("Invalid stored resource asset identity");
    }
    return asset;
}
export function readTextDocument(scopeId: string, row: ResourceEntityDocument): ResourceTextRecord {
    if (row.kind !== "texts" || row.protocol !== "ulvia-resource-entity/v1" || row.scopeId !== scopeId) {
        throw new ResourceArchiveError("Invalid stored resource text scope or protocol");
    }
    const record = readTextRecord(row.record);
    if (row._id !== resourceEntityId(scopeId, "texts", record.source.namespace)) {
        throw new ResourceArchiveError("Invalid stored resource text identity");
    }
    return record;
}
