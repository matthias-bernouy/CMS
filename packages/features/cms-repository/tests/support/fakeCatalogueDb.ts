import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";

type Document = { _id: string; revision?: number };
type Filter = Record<string, unknown>;

class Collection {
    readonly documents = new Map<string, Document>();

    async createIndex(): Promise<void> {}

    async findOne(filter: Filter, options?: { projection?: { _id?: number } }): Promise<Document | null> {
        const document = [...this.documents.values()].find((candidate) => matches(candidate, filter));
        if (!document) {
            return null;
        }
        const cloned = cloneDocument(document);
        if (options?.projection?._id === 0) {
            delete (cloned as Partial<Document>)._id;
        }
        return cloned;
    }

    find(filter: Filter) {
        return {
            toArray: async () =>
                [...this.documents.values()].filter((document) => matches(document, filter)).map(cloneDocument),
        };
    }

    async insertOne(document: Document): Promise<void> {
        if (this.documents.has(document._id)) {
            throw new MongoServerError({ ok: 0, code: 11000, errmsg: "duplicate key" });
        }
        this.documents.set(document._id, cloneDocument(document));
    }

    async updateOne(
        filter: Filter,
        update: { $setOnInsert?: Record<string, unknown>; $set?: Record<string, unknown> },
        options?: { upsert?: boolean },
    ) {
        const current = [...this.documents.values()].find((document) => matches(document, filter));
        if (current) {
            if (update.$set) {
                Object.assign(current, cloneDocument(update.$set));
            }
            return { matchedCount: 1, modifiedCount: update.$set ? 1 : 0, upsertedCount: 0 };
        }
        if (!options?.upsert) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        const inserted = cloneDocument({ ...filter, ...update.$setOnInsert, ...update.$set }) as Document;
        if (typeof inserted._id !== "string" || this.documents.has(inserted._id)) {
            throw new MongoServerError({ ok: 0, code: 11000, errmsg: "duplicate key" });
        }
        this.documents.set(inserted._id, inserted);
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }

    async deleteOne(filter: Filter) {
        const current = [...this.documents.values()].find((document) => matches(document, filter));
        if (!current) {
            return { deletedCount: 0 };
        }
        this.documents.delete(current._id);
        return { deletedCount: 1 };
    }

    async deleteMany(filter: Filter) {
        const matchesFilter = [...this.documents.values()].filter((document) => matches(document, filter));
        for (const document of matchesFilter) {
            this.documents.delete(document._id);
        }
        return { deletedCount: matchesFilter.length };
    }

    async replaceOne(filter: Filter, document: Omit<Document, "_id"> & Partial<Pick<Document, "_id">>, options = {}) {
        const current = [...this.documents.values()].find((candidate) => matches(candidate, filter));
        if (current) {
            this.documents.set(current._id, cloneDocument({ _id: current._id, ...document }));
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (!(options as { upsert?: boolean }).upsert) {
            return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        const id = document._id ?? filter._id;
        if (typeof id !== "string" || this.documents.has(id)) {
            throw new MongoServerError({ ok: 0, code: 11000, errmsg: "duplicate key" });
        }
        this.documents.set(id, cloneDocument({ _id: id, ...document }));
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
}

function matches(document: Document, filter: Filter): boolean {
    return Object.entries(filter).every(([key, value]) => document[key as keyof Document] === value);
}

function cloneDocument<T>(value: T): T {
    if (value instanceof Uint8Array) {
        return value.slice() as T;
    }
    if (value !== null && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(cloneDocument) as T;
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneDocument(item)])) as T;
    }
    return value;
}

export function fakeCatalogueDb(): Db {
    const collections = new Map<string, Collection>();
    return {
        collection: (name: string) => {
            const collection = collections.get(name) ?? new Collection();
            collections.set(name, collection);
            return collection;
        },
    } as unknown as Db;
}
