import type { Collection, Db, OptionalUnlessRequiredId } from "mongodb";
import { DuplicateTriggerError } from "../core/errors";
import type { TriggerLastRun, TriggerRecord } from "../interfaces/TriggerDefinition";
import type { TriggerRepository } from "../interfaces/TriggerRepository";

export type MongoTriggerRepositoryConfig = {
    collectionPrefix?: string;
};

type TriggerDoc = Omit<TriggerRecord, "id"> & { _id: string };

export class MongoTriggerRepository implements TriggerRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoTriggerRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await this.triggers.createIndex({ "event.source": 1, "event.endpoint": 1, "event.phase": 1, enabled: 1 });
    }

    private get triggers(): Collection<TriggerDoc> {
        return this.db.collection<TriggerDoc>(this.prefix + "triggers");
    }

    async createTrigger(trigger: TriggerRecord): Promise<TriggerRecord> {
        try {
            await this.triggers.insertOne(toDoc(trigger) as OptionalUnlessRequiredId<TriggerDoc>);
        } catch (error) {
            if (isDuplicateKey(error)) throw new DuplicateTriggerError(trigger.id);
            throw error;
        }
        return structuredClone(trigger);
    }

    async updateTrigger(trigger: TriggerRecord): Promise<TriggerRecord | null> {
        const { id: _id, ...rest } = trigger;
        const doc = await this.triggers.findOneAndReplace(
            { _id },
            rest,
            { returnDocument: "after" },
        );
        return fromDoc(doc);
    }

    async deleteTrigger(id: string): Promise<boolean> {
        const result = await this.triggers.deleteOne({ _id: id });
        return result.deletedCount > 0;
    }

    async getTrigger(id: string): Promise<TriggerRecord | null> {
        return fromDoc(await this.triggers.findOne({ _id: id }));
    }

    async getAllTriggers(): Promise<TriggerRecord[]> {
        const docs = await this.triggers.find().toArray();
        return docs.map(doc => fromDoc(doc)!);
    }

    async setEnabled(id: string, enabled: boolean): Promise<TriggerRecord | null> {
        return fromDoc(await this.triggers.findOneAndUpdate(
            { _id: id },
            { $set: { enabled } },
            { returnDocument: "after" },
        ));
    }

    async recordRun(id: string, lastRun: TriggerLastRun): Promise<TriggerRecord | null> {
        return fromDoc(await this.triggers.findOneAndUpdate(
            { _id: id },
            { $set: { lastRun } },
            { returnDocument: "after" },
        ));
    }
}

function toDoc(trigger: TriggerRecord): TriggerDoc {
    const { id, ...rest } = trigger;
    return { _id: id, ...rest };
}

function fromDoc(doc: TriggerDoc | null): TriggerRecord | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
}

function isDuplicateKey(error: unknown): boolean {
    return !!error && typeof error === "object" && (error as { code?: number }).code === 11000;
}
