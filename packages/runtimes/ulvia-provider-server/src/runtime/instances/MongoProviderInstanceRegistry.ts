import {
    ProviderInstanceRevisionConflictError,
    type CreateProviderInstanceRecord,
    type ProviderInstanceRecord,
    type ProviderInstanceRegistry,
    type UpdateProviderInstanceRecord,
} from "@bernouy/ulvia-provider";
import type { Collection, Db } from "mongodb";
import { assertInstanceCreationAuthority, assertInstanceRepository } from "@bernouy/hosting/instances";
import { hostingOrigin, HostingError } from "@bernouy/hosting";

export type ProviderInstanceDocument = Omit<ProviderInstanceRecord, "createdAt" | "updatedAt"> & {
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
        assertInstanceCreationAuthority(record.creationAuthority);
        assertInstanceRepository(record.repository);
        const now = new Date();
        const document: ProviderInstanceDocument = {
            ...record,
            revision: 1,
            createdAt: now,
            updatedAt: now,
        };
        await this.#instances.insertOne(document);
        return serializeProviderInstance(document);
    }

    async get(instanceId: string): Promise<ProviderInstanceRecord | null> {
        const document = await this.#instances.findOne({ id: instanceId });
        return document ? serializeProviderInstance(document) : null;
    }

    async setPublicOrigin(
        instanceId: string,
        expectedRevision: number,
        origin: string,
    ): Promise<ProviderInstanceRecord> {
        const canonical = hostingOrigin(origin).origin;
        if (canonical !== origin) {
            throw new HostingError("INVALID_INPUT", "The elected origin must be canonical");
        }
        const current = await this.get(instanceId);
        if (!current || current.status !== "ready" || current.revision !== expectedRevision) {
            throw new HostingError("CONFLICT", "Instance changed during primary election");
        }
        const record = await this.#instances.findOneAndUpdate(
            {
                id: instanceId,
                revision: expectedRevision,
                status: "ready",
                creationAuthority: current.creationAuthority,
            },
            { $set: { cmsUrl: origin, updatedAt: new Date() }, $inc: { revision: 1 } },
            { returnDocument: "after" },
        );
        if (!record) {
            throw new HostingError("CONFLICT", "Instance changed during primary election");
        }
        return serializeProviderInstance(record);
    }

    async getByIdempotencyKey(idempotencyKey: string): Promise<ProviderInstanceRecord | null> {
        const document = await this.#instances.findOne({ idempotencyKey });
        return document ? serializeProviderInstance(document) : null;
    }

    async *scan(): AsyncIterable<ProviderInstanceRecord> {
        const cursor = this.#instances.find({}).sort({ id: 1 }).batchSize(50);
        try {
            for await (const document of cursor) {
                yield serializeProviderInstance(document);
            }
        } finally {
            await cursor.close();
        }
    }

    async page(input: { after: string | null; limit: number }) {
        if (
            !Number.isSafeInteger(input.limit) ||
            input.limit < 1 ||
            input.limit > 50 ||
            (input.after !== null && !/^instance:[A-Za-z0-9-]{1,100}$/u.test(input.after))
        ) {
            throw new TypeError("Invalid instance page cursor or limit");
        }
        const records = await this.#instances
            .find(input.after === null ? {} : { id: { $gt: input.after } })
            .sort({ id: 1 })
            .limit(input.limit + 1)
            .toArray();
        const items = records.slice(0, input.limit).map(serializeProviderInstance);
        return { items, nextCursor: records.length > input.limit ? items.at(-1)!.id : null };
    }

    async update(
        instanceId: string,
        expectedRevision: number,
        changes: UpdateProviderInstanceRecord,
    ): Promise<ProviderInstanceRecord> {
        // Validate mandatory provenance before any mutation; CAS also fences its immutable value.
        const current = await this.get(instanceId);
        if (!current || current.revision !== expectedRevision) {
            throw new ProviderInstanceRevisionConflictError(instanceId);
        }
        if (changes.repository !== undefined) {
            assertInstanceRepository(changes.repository);
        }
        const set: Partial<ProviderInstanceDocument> = {
            ...(changes.status ? { status: changes.status } : {}),
            ...(changes.systemPlan ? { systemPlan: changes.systemPlan } : {}),
            ...(changes.repository ? { repository: changes.repository } : {}),
            ...(changes.failure === null ? {} : changes.failure ? { failure: changes.failure } : {}),
            updatedAt: new Date(),
        };
        const unset = changes.failure === null ? { failure: "" as const } : undefined;
        const document = await this.#instances.findOneAndUpdate(
            { id: instanceId, revision: expectedRevision, creationAuthority: current.creationAuthority },
            { $set: set, ...(unset ? { $unset: unset } : {}), $inc: { revision: 1 } },
            { returnDocument: "after" },
        );
        if (!document) {
            throw new ProviderInstanceRevisionConflictError(instanceId);
        }
        return serializeProviderInstance(document);
    }
}

export function serializeProviderInstance(document: ProviderInstanceDocument): ProviderInstanceRecord {
    const {
        id,
        idempotencyKey,
        idempotencyFingerprint,
        creationAuthority,
        storageKey,
        cmsUrl,
        gatewayUrl,
        label,
        status,
        systemPlan,
        repository,
        failure,
        revision,
    } = document;
    assertInstanceCreationAuthority(creationAuthority);
    assertInstanceRepository(repository);
    return {
        id,
        idempotencyKey,
        idempotencyFingerprint,
        creationAuthority,
        storageKey,
        cmsUrl,
        gatewayUrl,
        label,
        status,
        ...(systemPlan ? { systemPlan } : {}),
        repository,
        ...(failure ? { failure } : {}),
        revision,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
    };
}
