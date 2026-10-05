import type { Db } from "mongodb";

type Document = Record<string, unknown> & { _id: string };
type Filter = Record<string, unknown>;

export class FakeAuthTokenDb {
    readonly collection = new FakeAuthTokenCollection();

    asDb(): Db {
        return { collection: () => this.collection } as unknown as Db;
    }
}

class FakeAuthTokenCollection {
    readonly documents = new Map<string, Document>();
    readonly indexes: Array<{ keys: object; options: object }> = [];

    async createIndex(keys: object, options: object = {}): Promise<string> {
        this.indexes.push({ keys, options });
        return "index";
    }

    async insertOne(document: Document) {
        this.documents.set(document._id, structuredClone(document));
        return { acknowledged: true, insertedId: document._id };
    }

    async findOne(filter: Filter, options: { sort?: { createdAt?: number } } = {}) {
        const matches = [...this.documents.values()].filter((document) => matchesFilter(document, filter));
        if (options.sort?.createdAt) {
            matches.sort((left, right) => {
                const a = (left.createdAt as Date).getTime();
                const b = (right.createdAt as Date).getTime();
                return options.sort!.createdAt! < 0 ? b - a : a - b;
            });
        }
        return matches[0] ? structuredClone(matches[0]) : null;
    }

    async findOneAndUpdate(filter: Filter, update: Filter) {
        const current = [...this.documents.values()].find((document) => matchesFilter(document, filter));
        if (!current) {
            return null;
        }
        applyUpdate(current, update);
        return structuredClone(current);
    }

    async updateOne(filter: Filter, update: Filter) {
        const current = [...this.documents.values()].find((document) => matchesFilter(document, filter));
        if (!current) {
            return { matchedCount: 0, modifiedCount: 0 };
        }
        applyUpdate(current, update);
        return { matchedCount: 1, modifiedCount: 1 };
    }

    async deleteMany(filter: Filter) {
        let deletedCount = 0;
        for (const [id, document] of this.documents) {
            if (matchesFilter(document, filter)) {
                this.documents.delete(id);
                deletedCount++;
            }
        }
        return { deletedCount };
    }
}

function matchesFilter(document: Document, filter: Filter): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        if (key === "$and") {
            return (expected as Filter[]).every((part) => matchesFilter(document, part));
        }
        if (key === "$or") {
            return (expected as Filter[]).some((part) => matchesFilter(document, part));
        }
        const actual = document[key];
        if (!isOperator(expected)) {
            return actual === expected;
        }
        return Object.entries(expected).every(([operator, value]) => {
            if (operator === "$exists") {
                return (actual !== undefined) === value;
            }
            const comparable = actual instanceof Date ? actual.getTime() : actual;
            const limit = value instanceof Date ? value.getTime() : value;
            if (operator === "$gt") {
                return (comparable as number) > (limit as number);
            }
            if (operator === "$lte") {
                return (comparable as number) <= (limit as number);
            }
            throw new Error(`Unsupported fake Mongo operator ${operator}`);
        });
    });
}

function applyUpdate(document: Document, update: Filter): void {
    Object.assign(document, update.$set as object | undefined);
    for (const key of Object.keys((update.$unset as object | undefined) ?? {})) {
        delete document[key];
    }
}

function isOperator(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !(value instanceof Date);
}
