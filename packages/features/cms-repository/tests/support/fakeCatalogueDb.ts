import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";

type Document = { _id: string; revision?: number };

class Collection {
    readonly documents = new Map<string, Document>();

    async findOne(filter: { _id: string }): Promise<Document | null> {
        const document = this.documents.get(filter._id);
        return document ? structuredClone(document) : null;
    }

    find(filter: { _id?: string }) {
        return {
            toArray: async () =>
                [...this.documents.values()]
                    .filter((document) => filter._id === undefined || document._id === filter._id)
                    .map((document) => structuredClone(document)),
        };
    }

    async insertOne(document: Document): Promise<void> {
        if (this.documents.has(document._id)) {
            throw new MongoServerError({ ok: 0, code: 11000, errmsg: "duplicate key" });
        }
        this.documents.set(document._id, structuredClone(document));
    }

    async replaceOne(filter: { _id: string; revision: number }, document: Document) {
        const current = this.documents.get(filter._id);
        if (!current || current.revision !== filter.revision) {
            return { matchedCount: 0 };
        }
        this.documents.set(filter._id, structuredClone(document));
        return { matchedCount: 1 };
    }
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
