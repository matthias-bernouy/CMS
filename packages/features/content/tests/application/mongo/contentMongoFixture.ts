import type { StoredDocument, Filter } from "./fixtures/query";
import { matches, project } from "./fixtures/query";
import type { Db } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { FakeMongoClient, type FakeTransactionSupport } from "./fixtures/fakeMongoSession";

type ReplacementDocument = Record<string, unknown> & { _id?: string };

export class FakeContentCollection {
    readonly indexes: Array<{ keys: Filter; options: Filter }> = [];
    readonly findCalls: Filter[] = [];
    readonly findOptions: Array<{ projection?: Filter; maxTimeMS?: number }> = [];
    readonly loadedResults: StoredDocument[][] = [];
    beforeFind?: () => Promise<void>;
    readonly replaceOneCalls: Array<{
        filter: Filter;
        document: ReplacementDocument;
        options: { session?: unknown; upsert?: boolean };
    }> = [];
    readonly usedSessions: unknown[] = [];
    beforeInsertOne?: (document: StoredDocument) => Promise<void>;
    afterFindOne?: (filter: Filter, document: StoredDocument | null) => Promise<void>;
    beforeUpdateOne?: (update: { $set: Filter }) => Promise<void>;
    afterUpdateOne?: (update: { $set: Filter }) => Promise<void>;
    beforeDeleteOne?: (filter: Filter) => Promise<void>;
    beforeDeleteMany?: (filter: Filter) => Promise<void>;
    private readonly documents = new Map<string, StoredDocument>();

    async createIndex(keys: Filter, options: Filter): Promise<string> {
        this.indexes.push({ keys, options });
        return Object.keys(keys).join("_");
    }

    async insertOne(document: StoredDocument): Promise<void> {
        await this.beforeInsertOne?.(structuredClone(document));
        if (this.documents.has(document._id)) {
            throw Object.assign(new Error("duplicate key"), { code: 11000 });
        }
        this.documents.set(document._id, structuredClone(document));
    }

    async insertMany(documents: StoredDocument[]): Promise<void> {
        for (const document of documents) {
            await this.insertOne(document);
        }
    }

    async replaceOne(
        filter: Filter,
        document: ReplacementDocument,
        options: { session?: unknown; upsert?: boolean } = {},
    ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
        this.recordSession(options.session);
        this.replaceOneCalls.push(structuredClone({ filter, document, options }));
        const current = this.findStored(filter);
        if (current) {
            this.documents.set(current._id, structuredClone({ ...document, _id: current._id }));
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (options.upsert) {
            const id = document._id ?? String(filter._id);
            this.documents.set(id, structuredClone({ ...document, _id: id }));
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }

    find(
        filter: Filter = {},
        options: { projection?: Filter; maxTimeMS?: number } = {},
    ): {
        sort: (order: Filter) => {
            limit: (count: number) => { toArray: () => Promise<StoredDocument[]> };
            toArray: () => Promise<StoredDocument[]>;
        };
        limit: (count: number) => { toArray: () => Promise<StoredDocument[]> };
        toArray: () => Promise<StoredDocument[]>;
    } {
        this.findCalls.push(structuredClone(filter));
        this.findOptions.push(structuredClone(options));
        let documents = [...this.documents.values()].filter((document) => matches(document, filter));
        const query = {
            sort: (order: Filter) => {
                const [key, direction] = Object.entries(order)[0] ?? [];
                if (key) {
                    documents = documents.sort((left, right) =>
                        compareValues(left[key], right[key], Number(direction)),
                    );
                }
                return query;
            },
            limit: (count: number) => {
                documents = documents.slice(0, count);
                return query;
            },
            toArray: async () => {
                await this.beforeFind?.();
                const result = documents.map((document) =>
                    options.projection ? project(document, options.projection) : document,
                );
                this.loadedResults.push(structuredClone(result));
                return structuredClone(result);
            },
        };
        return query;
    }

    async findOne(filter: Filter, options: { session?: unknown } = {}): Promise<StoredDocument | null> {
        this.recordSession(options.session);
        const document = this.findStored(filter);
        const result = document ? structuredClone(document) : null;
        await this.afterFindOne?.(structuredClone(filter), result);
        return result;
    }

    async updateOne(
        filter: Filter,
        update: { $set: Filter; $unset?: Filter; $inc?: Filter },
        options: { session?: unknown } = {},
    ): Promise<{ matchedCount: number }> {
        this.recordSession(options.session);
        await this.beforeUpdateOne?.(structuredClone(update));
        const document = this.findStored(filter);
        if (document) {
            const next = structuredClone(document);
            for (const [path, value] of Object.entries(update.$set)) {
                const segments = path.split(".");
                let target: Record<string, unknown> = next;
                for (const segment of segments.slice(0, -1)) {
                    target = (target[segment] ??= {}) as Record<string, unknown>;
                }
                target[segments.at(-1)!] = structuredClone(value);
            }
            for (const [path, amount] of Object.entries(update.$inc ?? {})) {
                const segments = path.split(".");
                let target: Record<string, unknown> = next;
                for (const segment of segments.slice(0, -1)) {
                    target = (target[segment] ??= {}) as Record<string, unknown>;
                }
                const key = segments.at(-1)!;
                target[key] = Number(target[key] ?? 0) + Number(amount);
            }
            for (const path of Object.keys(update.$unset ?? {})) {
                const segments = path.split(".");
                let target: Record<string, unknown> = next;
                for (const segment of segments.slice(0, -1)) {
                    target = target[segment] as Record<string, unknown>;
                    if (!target) {
                        break;
                    }
                }
                if (target) {
                    delete target[segments.at(-1)!];
                }
            }
            this.documents.set(document._id, next);
            await this.afterUpdateOne?.(structuredClone(update));
            return { matchedCount: 1 };
        }
        return { matchedCount: 0 };
    }

    async updateMany(filter: Filter, update: { $set: Filter; $unset?: Filter }): Promise<{ matchedCount: number }> {
        const documents = await this.find(filter).toArray();
        for (const document of documents) {
            await this.updateOne({ _id: document._id }, update);
        }
        return { matchedCount: documents.length };
    }

    async deleteOne(filter: Filter): Promise<{ deletedCount: number }> {
        await this.beforeDeleteOne?.(structuredClone(filter));
        const document = this.findStored(filter);
        if (document) {
            this.documents.delete(document._id);
            return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
    }

    async deleteMany(filter: Filter): Promise<{ deletedCount: number }> {
        await this.beforeDeleteMany?.(structuredClone(filter));
        const documents = await this.find(filter).toArray();
        for (const document of documents) {
            this.documents.delete(document._id);
        }
        return { deletedCount: documents.length };
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

function compareValues(left: unknown, right: unknown, direction: number): number {
    if (typeof left === "number" && typeof right === "number") {
        return direction * (left - right);
    }
    return direction * String(left ?? "").localeCompare(String(right ?? ""));
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
    const repository = new MongoContentRepository(db as unknown as Db, { collectionPrefix: prefix });
    return { db, repository };
}
