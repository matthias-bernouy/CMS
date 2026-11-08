import type { Db, Collection } from "mongodb";
import type { ResourceInitializationStateStore } from "../interfaces";
import type { ResourceInitializationState } from "../schemas";
import { pendingResourceInitialization, parseResourceInitializationState, resourceInitializationError } from "../state";
import { resourceDigest } from "resources/storage/records";
import { assertInitializationTransition } from "./transition";

type StateDocument = ResourceInitializationState & { _id: string };
/** One mandatory state record per host-selected instance/site; no read-time provisioning or backfill. */
export class MongoResourceInitializationStateStore implements ResourceInitializationStateStore {
    private readonly records: Collection<StateDocument>;
    private readonly id: string;
    constructor(
        db: Db,
        private readonly instanceId: string,
        private readonly siteId: string,
    ) {
        parseResourceInitializationState(pendingResourceInitialization(instanceId, siteId));
        this.id = resourceDigest(["resource-initialization", instanceId, siteId]).slice(7);
        this.records = db.collection<StateDocument>("cms_resource_initialization");
    }
    private filter() {
        return { _id: this.id, instanceId: this.instanceId, siteId: this.siteId };
    }
    async initialize(): Promise<void> {
        try {
            await this.records.insertOne({
                _id: this.id,
                ...pendingResourceInitialization(this.instanceId, this.siteId),
            });
        } catch (error) {
            if (!error || typeof error !== "object" || !("code" in error) || error.code !== 11000) {
                throw error;
            }
            if (!(await this.read())) {
                throw resourceInitializationError("Resource initialization identity conflict", 409);
            }
        }
    }
    async read(): Promise<ResourceInitializationState | null> {
        const document = await this.records.findOne(this.filter());
        if (!document) {
            return null;
        }
        const { _id, ...input } = document;
        const state = parseResourceInitializationState(input);
        if (_id !== this.id || state.instanceId !== this.instanceId || state.siteId !== this.siteId) {
            throw resourceInitializationError("Stored resource initialization scope mismatch", 409);
        }
        return state;
    }
    async replace(input: ResourceInitializationState, expectedRevision: number): Promise<void> {
        const current = await this.read();
        if (!current) {
            throw resourceInitializationError("Resource initialization is not configured", 409);
        }
        const next = assertInitializationTransition(current, input, expectedRevision);
        const result = await this.records.replaceOne({ ...this.filter(), revision: expectedRevision }, { ...next });
        if (result.matchedCount !== 1) {
            throw resourceInitializationError("Resource initialization revision conflict", 409);
        }
    }
}
