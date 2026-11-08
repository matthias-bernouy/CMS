import type { InstanceTransitionRecord, InstanceTransitionStore } from "@bernouy/ulvia-provider";
import type { Collection, Db } from "mongodb";

type TransitionDocument = Omit<InstanceTransitionRecord, "id"> & { _id: string };

export class MongoInstanceTransitionStore implements InstanceTransitionStore {
    readonly #transitions: Collection<TransitionDocument>;

    constructor(db: Db) {
        this.#transitions = db.collection("ulvia_provider_instance_transitions");
    }

    async init(): Promise<void> {
        // Explicit index evolution: old plan uniqueness would reject distinct system transitions.
        const indexes = await this.#transitions
            .listIndexes()
            .toArray()
            .catch((error: { code?: number }) => {
                if (error.code === 26) {
                    return [];
                }
                throw error;
            });
        if (indexes.some(({ name }) => name === "instance_target_profile")) {
            await this.#transitions.dropIndex("instance_target_profile");
        }
        await this.#transitions.createIndex({ status: 1, "lease.expiresAt": 1 }, { name: "transition_recovery" });
    }

    async createOrGet(
        value: Omit<InstanceTransitionRecord, "revision" | "createdAt" | "updatedAt">,
    ): Promise<InstanceTransitionRecord> {
        const now = new Date().toISOString();
        const record: InstanceTransitionRecord = { ...value, revision: 1, createdAt: now, updatedAt: now };
        try {
            await this.#transitions.insertOne(toDocument(record));
            return record;
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.#transitions.findOne({ _id: value.id });
            if (!existing) {
                throw error;
            }
            return fromDocument(existing);
        }
    }

    async get(id: string): Promise<InstanceTransitionRecord | null> {
        const value = await this.#transitions.findOne({ _id: id });
        return value ? fromDocument(value) : null;
    }

    async listRetained(): Promise<readonly InstanceTransitionRecord[]> {
        return (await this.#transitions.find({ status: { $ne: "succeeded" } }).toArray()).map(fromDocument);
    }

    async listRecoverable(now: string, limit: number): Promise<readonly InstanceTransitionRecord[]> {
        return (
            await this.#transitions
                .find({ $or: [{ status: "queued" }, { status: "running", "lease.expiresAt": { $lte: now } }] })
                .sort({ createdAt: 1 })
                .limit(limit)
                .toArray()
        ).map(fromDocument);
    }

    async requeue(
        id: string,
        revision: number,
        now: string,
        administratorSub?: string,
        sourceRevision?: number,
    ): Promise<InstanceTransitionRecord | null> {
        const value = await this.#transitions.findOneAndUpdate(
            { _id: id, revision, status: "failed" },
            {
                $set: {
                    status: "queued",
                    updatedAt: now,
                    ...(administratorSub ? { administratorSub, sourceRevision } : {}),
                },
                $unset: { failure: "", lease: "" },
                $inc: { revision: 1 },
            },
            { returnDocument: "after" },
        );
        return value ? fromDocument(value) : null;
    }

    async claim(id: string, revision: number, owner: string, expiresAt: string, now: string): Promise<boolean> {
        const result = await this.#transitions.updateOne(
            { _id: id, revision, $or: [{ status: "queued" }, { status: "running", "lease.expiresAt": { $lte: now } }] },
            { $set: { status: "running", lease: { owner, expiresAt }, updatedAt: now }, $inc: { revision: 1 } },
        );
        return result.modifiedCount === 1;
    }

    async renew(id: string, owner: string, expiresAt: string, now: string): Promise<boolean> {
        const result = await this.#transitions.updateOne(
            { _id: id, status: "running", "lease.owner": owner },
            { $set: { "lease.expiresAt": expiresAt, updatedAt: now } },
        );
        return result.matchedCount === 1;
    }

    async completeStep(id: string, owner: string, step: string, now: string): Promise<InstanceTransitionRecord | null> {
        const value = await this.#transitions.findOneAndUpdate(
            { _id: id, status: "running", "lease.owner": owner, steps: step },
            { $addToSet: { completedSteps: step }, $set: { updatedAt: now }, $inc: { revision: 1 } },
            { returnDocument: "after" },
        );
        return value ? fromDocument(value) : null;
    }

    succeed(id: string, owner: string, now: string): Promise<boolean> {
        return this.#finish(id, owner, { status: "succeeded" }, now);
    }

    fail(id: string, owner: string, failure: string, now: string): Promise<boolean> {
        return this.#finish(id, owner, { status: "failed", failure }, now);
    }

    async #finish(
        id: string,
        owner: string,
        patch: Pick<InstanceTransitionRecord, "status"> & { failure?: string },
        now: string,
    ): Promise<boolean> {
        const result = await this.#transitions.updateOne(
            { _id: id, status: "running", "lease.owner": owner },
            { $set: { ...patch, updatedAt: now }, $unset: { lease: "" }, $inc: { revision: 1 } },
        );
        return result.modifiedCount === 1;
    }
}

function toDocument(record: InstanceTransitionRecord): TransitionDocument {
    const { id, ...value } = structuredClone(record);
    return { _id: id, ...value };
}

function fromDocument(document: TransitionDocument): InstanceTransitionRecord {
    const { _id, ...value } = structuredClone(document);
    return { id: _id, ...value };
}
