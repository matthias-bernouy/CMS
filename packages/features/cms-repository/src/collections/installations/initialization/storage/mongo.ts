import type { Db, Collection } from "mongodb";
import type { InitializationRecord, InitializationStateStore } from "../execution/interfaces";
import { pendingInitialization, validateInitializationRecord } from "../execution/state";

type StateDocument = InitializationRecord & { _id: string };

export class MongoInitializationStateStore implements InitializationStateStore {
    private readonly records: Collection<StateDocument>;
    constructor(db: Db) {
        this.records = db.collection<StateDocument>("cms_site_initialization");
    }
    async initialize(siteId: string): Promise<void> {
        const record = pendingInitialization(siteId);
        await this.records.updateOne({ _id: siteId }, { $setOnInsert: { ...record } }, { upsert: true });
    }
    async read(siteId: string): Promise<InitializationRecord | null> {
        const document = await this.records.findOne({ _id: siteId, siteId });
        if (!document) {
            return null;
        }
        const { _id, ...record } = document;
        validateInitializationRecord(record);
        return record;
    }
    async replace(record: InitializationRecord, expectedRevision: number): Promise<void> {
        validateInitializationRecord(record);
        if (record.revision !== expectedRevision + 1) {
            throw new TypeError("Invalid initialization revision");
        }
        const result = await this.records.replaceOne(
            { _id: record.siteId, siteId: record.siteId, revision: expectedRevision },
            { ...record },
        );
        if (result.matchedCount !== 1) {
            throw Object.assign(new Error("Initialization revision conflict"), { status: 409 });
        }
    }
}
