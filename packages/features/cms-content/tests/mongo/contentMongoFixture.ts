import type { Db } from "mongodb";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";
import { FakeMongoClient, type FakeTransactionSupport } from "./fakeMongoSession";

type StoredDocument = { _id: string } & Record<string, unknown>;
type Filter = Record<string, unknown>;

export class FakeContentCollection {
    readonly indexes: Array<{ keys: Filter; options: Filter }> = [];
    readonly replaceOneCalls: Array<{
        filter: Filter;
        document: StoredDocument;
        options: { session?: unknown; upsert?: boolean };
    }> = [];
    readonly usedSessions: unknown[] = [];
    afterUpdateOne?: (update: { $set: Filter }) => Promise<void>;
    updateManyCalls = 0;
    private readonly documents = new Map<string, StoredDocument>();

    async createIndex(keys: Filter, options: Filter): Promise<string> {
        this.indexes.push({ keys, options });
        return Object.keys(keys).join("_");
    }

    async updateMany(): Promise<void> {
        this.updateManyCalls += 1;
    }

    async insertOne(document: StoredDocument): Promise<void> {
        if (this.documents.has(document._id)) {
            throw Object.assign(new Error("duplicate key"), { code: 11000 });
        }
        this.documents.set(document._id, structuredClone(document));
    }

    async replaceOne(
        filter: Filter,
        document: StoredDocument,
        options: { session?: unknown; upsert?: boolean } = {},
    ): Promise<{ matchedCount: number; upsertedCount: number }> {
        this.recordSession(options.session);
        this.replaceOneCalls.push(structuredClone({ filter, document, options }));
        const current = this.findStored(filter);
        if (current) {
            this.documents.set(current._id, structuredClone({ ...document, _id: current._id }));
            return { matchedCount: 1, upsertedCount: 0 };
        }
        if (options.upsert) {
            this.documents.set(document._id, structuredClone(document));
            return { matchedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, upsertedCount: 0 };
    }

    find(filter: Filter = {}): { toArray: () => Promise<StoredDocument[]> } {
        const documents = [...this.documents.values()].filter((document) => matches(document, filter));
        return { toArray: async () => structuredClone(documents) };
    }

    async findOne(filter: Filter, options: { session?: unknown } = {}): Promise<StoredDocument | null> {
        this.recordSession(options.session);
        const document = this.findStored(filter);
        return document ? structuredClone(document) : null;
    }

    async updateOne(
        filter: Filter,
        update: { $set: Filter },
        options: { session?: unknown } = {},
    ): Promise<{ matchedCount: number }> {
        this.recordSession(options.session);
        const document = this.findStored(filter);
        if (document) {
            this.documents.set(document._id, { ...document, ...structuredClone(update.$set) });
            await this.afterUpdateOne?.(structuredClone(update));
            return { matchedCount: 1 };
        }
        return { matchedCount: 0 };
    }

    async deleteOne(filter: Filter): Promise<void> {
        const document = this.findStored(filter);
        if (document) {
            this.documents.delete(document._id);
        }
    }

    private findStored(filter: Filter): StoredDocument | undefined {
        return [...this.documents.values()].find((document) => matches(document, filter));
    }

    private recordSession(session: unknown): void {
        if (session) {
            this.usedSessions.push(session);
        }
    }
}

export class FakeContentDb {
    readonly requestedCollections: string[] = [];
    readonly client: FakeMongoClient;
    private readonly collections = new Map<string, FakeContentCollection>();

    constructor(transactions: FakeTransactionSupport = "supported") {
        this.client = new FakeMongoClient(transactions);
    }

    collection(name: string): FakeContentCollection {
        this.requestedCollections.push(name);
        const existing = this.collections.get(name);
        if (existing) {
            return existing;
        }
        const collection = new FakeContentCollection();
        this.collections.set(name, collection);
        return collection;
    }

    get(name: string): FakeContentCollection {
        return this.collection(name);
    }
}

export function createMongoContentRepository(prefix = "") {
    const db = new FakeContentDb();
    const repository = new MongoCmsRepository(db as unknown as Db, { collectionPrefix: prefix });
    return { db, repository };
}

function matches(document: StoredDocument, filter: Filter): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        const { exists, value } = nestedValue(document, key);
        if (expected && typeof expected === "object" && !Array.isArray(expected)) {
            const operator = expected as { $eq?: unknown; $exists?: boolean; $ne?: unknown };
            if (operator.$exists !== undefined && exists !== operator.$exists) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$ne") && value === operator.$ne) {
                return false;
            }
            if (Object.prototype.hasOwnProperty.call(operator, "$eq") && !Bun.deepEquals(value, operator.$eq)) {
                return false;
            }
            if (
                operator.$exists !== undefined ||
                Object.prototype.hasOwnProperty.call(operator, "$ne") ||
                Object.prototype.hasOwnProperty.call(operator, "$eq")
            ) {
                return true;
            }
        }
        return Bun.deepEquals(value, expected);
    });
}

function nestedValue(document: StoredDocument, path: string): { exists: boolean; value: unknown } {
    const segments = path.split(".");
    let value: unknown = document;
    for (const segment of segments) {
        if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, segment)) {
            return { exists: false, value: undefined };
        }
        value = (value as Record<string, unknown>)[segment];
    }
    return { exists: true, value };
}
