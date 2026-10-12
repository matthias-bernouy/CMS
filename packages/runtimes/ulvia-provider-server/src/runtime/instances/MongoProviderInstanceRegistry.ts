import {
    ProviderInstanceRevisionConflictError,
    type CreateProviderInstanceRecord,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type UpdateProviderInstanceRecord,
} from "@bernouy/ulvia-provider";
import type { Collection, Db } from "mongodb";

type ProviderInstanceDocument = Omit<ProviderInstanceRecord, "createdAt" | "updatedAt"> & {
    createdAt: Date;
    updatedAt: Date;
};

export class MongoProviderInstanceRegistry implements ProviderInstanceRegistry {
    readonly #instances: Collection<ProviderInstanceDocument>;

    constructor(db: Db) {
        this.#instances = db.collection("ulvia_provider_instances");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.#instances.createIndex({ id: 1 }, { unique: true }),
            this.#instances.createIndex({ idempotencyKey: 1 }, { unique: true }),
            this.#instances.createIndex({ storageKey: 1 }, { unique: true }),
        ]);
    }

    async create(record: CreateProviderInstanceRecord): Promise<ProviderInstanceRecord> {
        const now = new Date();
        const document: ProviderInstanceDocument = {
            ...record,
            completedSteps: [],
            revision: 1,
            createdAt: now,
            updatedAt: now,
        };
        await this.#instances.insertOne(document);
        return serialize(document);
    }

    async get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        const document = await this.#instances.findOne({ id: instanceId });
        return document ? serialize(document) : null;
    }

    async getByIdempotencyKey(idempotencyKey: string): Promise<ProviderInstanceRecord | null> {
        const document = await this.#instances.findOne({ idempotencyKey });
        return document ? serialize(document) : null;
    }

    async list(): Promise<readonly ProviderInstanceRecord[]> {
        return (await this.#instances.find().sort({ createdAt: 1 }).toArray()).map(serialize);
    }

    async update(
        instanceId: string,
        expectedRevision: number,
        changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord> {
        const set: Partial<ProviderInstanceDocument> = {
            ...(changes.status ? { status: changes.status } : {}),
            ...(changes.completedSteps ? { completedSteps: [...changes.completedSteps] } : {}),
            ...(changes.failure === null ? {} : changes.failure ? { failure: changes.failure } : {}),
            updatedAt: new Date(),
        };
        const unset = changes.failure === null ? { failure: "" as const } : undefined;
        const document = await this.#instances.findOneAndUpdate(
            { id: instanceId, revision: expectedRevision },
            { $set: set, ...(unset ? { $unset: unset } : {}), $inc: { revision: 1 } },
            { returnDocument: "after" },
        );
        if (!document) {
            throw new ProviderInstanceRevisionConflictError(instanceId);
        }
        return serialize(document);
    }
}

function serialize(document: ProviderInstanceDocument): ProviderInstanceRecord {
    const { id, idempotencyKey, storageKey, kernelUrl, label, status, profile, completedSteps, failure, revision } =
        document;
    return {
        id,
        idempotencyKey,
        storageKey,
        kernelUrl,
        label,
        status,
        profile,
        completedSteps,
        ...(failure ? { failure } : {}),
        revision,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
    };
}
