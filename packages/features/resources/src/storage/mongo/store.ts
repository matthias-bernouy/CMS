import type { Collection, Db } from "mongodb";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ResourceMetadataStore } from "resources/interfaces/entities";
import {
    assertResourceScope,
    assetReferences,
    resourceEntityId,
    ResourceConflictError,
} from "resources/storage/records";
import type { ResourceAssetMetadata, ResourceAssetReference, ResourceTextRecord } from "resources/storage/records";
import { ResourceArchiveError } from "resources/artifacts/archive/errors";
import { assetDocument, textDocument, readAssetDocument, readTextDocument } from "./documents";
import type { ResourceEntityDocument } from "./documents";

/** Every query is bound to the host's explicit instance/site scope. */
export class MongoResourceMetadataStore implements ResourceMetadataStore {
    private readonly entities: Collection<ResourceEntityDocument>;
    constructor(
        db: Db,
        readonly scopeId: string,
    ) {
        assertResourceScope(scopeId);
        this.entities = db.collection<ResourceEntityDocument>("cms_resource_entities");
    }
    async init(): Promise<void> {
        await this.entities.createIndex({ scopeId: 1, kind: 1, _id: 1 });
    }
    async isEmpty(): Promise<boolean> {
        return (await this.entities.findOne({ scopeId: this.scopeId }, { projection: { _id: 1 } })) === null;
    }
    async readAssets(input: readonly ResourceAssetReference[]) {
        const refs = assetReferences(input);
        if (!refs.length) {
            return [];
        }
        const rows = await this.entities
            .find(
                {
                    scopeId: this.scopeId,
                    kind: "asset",
                    _id: { $in: refs.map((ref) => resourceEntityId(this.scopeId, "asset", ref.namespace, ref.id)) },
                },
                { projection: { _id: 1, protocol: 1, scopeId: 1, kind: 1, asset: 1 } },
            )
            .limit(refs.length)
            .toArray();
        return rows.map((row) => readAssetDocument(this.scopeId, row));
    }
    async createAsset(input: ResourceAssetMetadata): Promise<void> {
        const row = assetDocument(this.scopeId, input);
        try {
            await this.entities.insertOne(row);
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
            const current = await this.entities.findOne({ _id: row._id, scopeId: this.scopeId, kind: "asset" });
            if (
                !current ||
                canonicalizeIJson(readAssetDocument(this.scopeId, current)) !== canonicalizeIJson(row.asset)
            ) {
                throw new ResourceConflictError("Resource asset identity already exists");
            }
        }
    }
    async readTexts() {
        const rows = await this.entities
            .find(
                { scopeId: this.scopeId, kind: "texts" },
                { projection: { _id: 1, protocol: 1, scopeId: 1, kind: 1, record: 1 } },
            )
            .sort({ _id: 1 })
            .limit(33)
            .toArray();
        if (rows.length > 32) {
            throw new ResourceArchiveError("Resource text namespace budget exceeded");
        }
        return rows.map((row) => readTextDocument(this.scopeId, row));
    }
    async getTexts(namespace: string) {
        const row = await this.entities.findOne({
            _id: resourceEntityId(this.scopeId, "texts", namespace),
            scopeId: this.scopeId,
            kind: "texts",
        });
        return row ? readTextDocument(this.scopeId, row) : null;
    }
    async createTexts(input: ResourceTextRecord): Promise<void> {
        const row = textDocument(this.scopeId, input);
        try {
            await this.entities.insertOne(row);
        } catch (error) {
            if (!duplicate(error)) {
                throw error;
            }
            const current = await this.getTexts(row.record.source.namespace);
            if (!current || current.revision !== row.record.revision) {
                throw new ResourceConflictError("Resource text namespace already exists");
            }
        }
    }
    async replaceTexts(input: ResourceTextRecord, expectedRevision: string): Promise<void> {
        const row = textDocument(this.scopeId, input);
        const result = await this.entities.replaceOne(
            { _id: row._id, scopeId: this.scopeId, kind: "texts", "record.revision": expectedRevision },
            row,
        );
        if (result.matchedCount !== 1) {
            throw new ResourceConflictError("Resource text revision changed");
        }
    }
}
function duplicate(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
