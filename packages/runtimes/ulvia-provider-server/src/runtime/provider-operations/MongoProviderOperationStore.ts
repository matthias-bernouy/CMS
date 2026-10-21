import type { Collection, Db } from "mongodb";
import type { ProviderOperationPage, ProviderOperationRecord, ProviderOperationStore } from "@bernouy/ulvia-provider";

type OperationDocument = Omit<ProviderOperationRecord, "id"> & { _id: string };

export class MongoProviderOperationStore implements ProviderOperationStore {
    readonly #records: Collection<OperationDocument>;

    constructor(db: Db) {
        this.#records = db.collection("ulvia_provider_operations");
    }

    async init(): Promise<void> {
        await Promise.all([
            this.#records.createIndex(
                { siteId: 1, contractId: 1, "context.contractVersion": 1, capabilityId: 1, idempotencyKey: 1 },
                { unique: true, name: "provider_operation_release_idempotency" },
            ),
            this.#records.createIndex({ status: 1, "lease.expiresAt": 1 }, { name: "provider_operation_recovery" }),
            this.#records.createIndex(
                { siteId: 1, contractId: 1, _id: -1 },
                { name: "provider_operation_contract_history" },
            ),
        ]);
        try {
            await this.#records.dropIndex("provider_operation_idempotency");
        } catch (error) {
            if ((error as { code?: number }).code !== 27) {
                throw error;
            }
        }
    }

    async createOrGet(record: ProviderOperationRecord): Promise<{ record: ProviderOperationRecord; created: boolean }> {
        const document = toDocument(record);
        try {
            await this.#records.insertOne(document);
            return { record: structuredClone(record), created: true };
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
            const existing = await this.#records.findOne({
                siteId: record.siteId,
                contractId: record.contractId,
                "context.contractVersion": record.context.contractVersion,
                capabilityId: record.capabilityId,
                idempotencyKey: record.idempotencyKey,
            });
            if (!existing) {
                throw error;
            }
            return { record: fromDocument(existing), created: false };
        }
    }

    async get(siteId: string, id: string): Promise<ProviderOperationRecord | null> {
        const document = await this.#records.findOne({ _id: id, siteId });
        return document ? fromDocument(document) : null;
    }

    async list(
        siteId: string,
        contractId: string,
        cursor: string | undefined,
        limit: number,
    ): Promise<ProviderOperationPage> {
        const documents = await this.#records
            .find({ siteId, contractId, ...(cursor ? { _id: { $lt: cursor } } : {}) })
            .sort({ _id: -1 })
            .limit(limit + 1)
            .toArray();
        const hasMore = documents.length > limit;
        const items = documents.slice(0, limit).map(fromDocument);
        return { items, ...(hasMore ? { nextCursor: items.at(-1)!.id } : {}) };
    }

    async listRecoverable(now: string, limit: number): Promise<readonly ProviderOperationRecord[]> {
        const documents = await this.#records
            .find({ $or: [{ status: "queued" }, { status: "running", "lease.expiresAt": { $lte: now } }] })
            .sort({ _id: 1 })
            .limit(limit)
            .toArray();
        return documents.map(fromDocument);
    }

    async claim(id: string, revision: number, token: string, expiresAt: string, now: string): Promise<boolean> {
        const result = await this.#records.updateOne(
            {
                _id: id,
                revision,
                $or: [{ status: "queued" }, { status: "running", "lease.expiresAt": { $lte: now } }],
            },
            {
                $set: { status: "running", updatedAt: now, lease: { token, expiresAt } },
                $inc: { revision: 1 },
                $unset: { result: "", errorCode: "" },
            },
        );
        return result.modifiedCount === 1;
    }

    async renew(id: string, token: string, expiresAt: string, now: string): Promise<boolean> {
        const result = await this.#records.updateOne(
            { _id: id, status: "running", "lease.token": token },
            { $set: { updatedAt: now, "lease.expiresAt": expiresAt } },
        );
        return result.matchedCount === 1;
    }

    succeed(id: string, token: string, result: unknown, now: string): Promise<boolean> {
        return this.#finish(id, token, { status: "succeeded", result: structuredClone(result) }, now);
    }

    fail(id: string, token: string, errorCode: string, now: string): Promise<boolean> {
        return this.#finish(id, token, { status: "failed", errorCode }, now);
    }

    async #finish(
        id: string,
        token: string,
        patch: Pick<ProviderOperationRecord, "status"> & Partial<Pick<ProviderOperationRecord, "result" | "errorCode">>,
        now: string,
    ): Promise<boolean> {
        const result = await this.#records.updateOne(
            { _id: id, status: "running", "lease.token": token },
            { $set: { ...patch, updatedAt: now }, $inc: { revision: 1 }, $unset: { lease: "" } },
        );
        return result.modifiedCount === 1;
    }
}

function toDocument(record: ProviderOperationRecord): OperationDocument {
    const { id, ...document } = structuredClone(record);
    return { _id: id, ...document };
}

function fromDocument(document: OperationDocument): ProviderOperationRecord {
    const { _id, ...record } = structuredClone(document);
    return { id: _id, ...record };
}
