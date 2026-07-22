import type { Db } from "mongodb";
import { MongoCmsRepository } from "@bernouy/cms-content/mongo";

type StoredDocument = { _id: string } & Record<string, unknown>;
type Filter = Record<string, unknown>;

export class FakeContentCollection {
    readonly indexes: Array<{ keys: Filter; options: Filter }> = [];
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

    async replaceOne(filter: Filter, document: StoredDocument): Promise<void> {
        const current = this.findStored(filter);
        const id = current?._id ?? document._id;
        this.documents.set(id, structuredClone({ ...document, _id: id }));
    }

    find(filter: Filter = {}): { toArray: () => Promise<StoredDocument[]> } {
        const documents = [...this.documents.values()].filter((document) => matches(document, filter));
        return { toArray: async () => structuredClone(documents) };
    }

    async findOne(filter: Filter): Promise<StoredDocument | null> {
        const document = this.findStored(filter);
        return document ? structuredClone(document) : null;
    }

    async updateOne(filter: Filter, update: { $set: Filter }): Promise<void> {
        const document = this.findStored(filter);
        if (document) {
            this.documents.set(document._id, { ...document, ...structuredClone(update.$set) });
        }
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
}

export class FakeContentDb {
    readonly requestedCollections: string[] = [];
    private readonly collections = new Map<string, FakeContentCollection>();

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
    return Object.entries(filter).every(([key, value]) => document[key] === value);
}
