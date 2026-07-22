import type { Db } from "mongodb";
import { MongoCmsFilesMetadata } from "@bernouy/cms-files/mongo";

type FileDocument = {
    _id: string;
    type: "file" | "folder";
    name: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    size?: number;
    mimeType?: string;
    contentHash?: string;
};
type Filter = Record<string, unknown>;
type Update = { $set?: Partial<FileDocument>; $setOnInsert?: Partial<FileDocument> };

class FakeCursor {
    private offset = 0;
    private maximum?: number;

    constructor(private documents: FileDocument[]) {}

    sort(specification: Record<string, 1 | -1>): this {
        const [field, direction] = Object.entries(specification)[0]!;
        this.documents.sort(
            (left, right) => compare(left[field as keyof FileDocument], right[field as keyof FileDocument]) * direction,
        );
        return this;
    }

    skip(count: number): this {
        this.offset = count;
        return this;
    }

    limit(count: number): this {
        this.maximum = count;
        return this;
    }

    async toArray(): Promise<FileDocument[]> {
        const end = this.maximum === undefined ? undefined : this.offset + this.maximum;
        return structuredClone(this.documents.slice(this.offset, end));
    }
}

export class FakeFilesCollection {
    readonly indexes: Array<{ keys: Filter; options: Filter }> = [];
    private readonly documents = new Map<string, FileDocument>();

    async createIndex(keys: Filter, options: Filter): Promise<string> {
        this.indexes.push({ keys, options });
        return "parentId_name";
    }

    async insertOne(document: FileDocument): Promise<void> {
        this.assertUnique(document);
        this.documents.set(document._id, structuredClone(document));
    }

    async findOne(filter: Filter): Promise<FileDocument | null> {
        const document = this.values().find((candidate) => matches(candidate, filter));
        return document ? structuredClone(document) : null;
    }

    find(filter: Filter): FakeCursor {
        return new FakeCursor(this.values().filter((document) => matches(document, filter)));
    }

    async countDocuments(filter: Filter): Promise<number> {
        return this.values().filter((document) => matches(document, filter)).length;
    }

    async findOneAndUpdate(
        filter: Filter,
        update: Update,
        options: { upsert?: boolean },
    ): Promise<FileDocument | null> {
        const existing = this.values().find((document) => matches(document, filter));
        if (!existing && !options.upsert) {
            return null;
        }
        const id = existing?._id ?? String(filter._id);
        const updated = {
            ...(existing ?? update.$setOnInsert),
            ...update.$set,
            _id: id,
        } as FileDocument;
        this.assertUnique(updated, id);
        this.documents.set(id, structuredClone(updated));
        return structuredClone(updated);
    }

    async deleteOne(filter: Filter): Promise<void> {
        const document = this.values().find((candidate) => matches(candidate, filter));
        if (document) {
            this.documents.delete(document._id);
        }
    }

    async deleteMany(filter: { _id: { $in: string[] } }): Promise<void> {
        for (const id of filter._id.$in) {
            this.documents.delete(id);
        }
    }

    aggregate(pipeline: Array<Record<string, unknown>>): { toArray: () => Promise<FileDocument[]> } {
        const match = pipeline[0]?.$match as { _id: string };
        const descendants: FileDocument[] = [];
        const pending = [match._id];
        while (pending.length > 0) {
            const parentId = pending.shift()!;
            const children = this.values().filter((document) => document.parentId === parentId);
            descendants.push(...children);
            pending.push(...children.map((child) => child._id));
        }
        return { toArray: async () => structuredClone(descendants) };
    }

    private values(): FileDocument[] {
        return [...this.documents.values()];
    }

    private assertUnique(candidate: FileDocument, exceptId?: string): void {
        if (this.documents.has(candidate._id) && candidate._id !== exceptId) {
            throw duplicateKeyError();
        }
        const clash = this.values().some(
            (document) =>
                document._id !== exceptId &&
                document.parentId === candidate.parentId &&
                document.name === candidate.name,
        );
        if (clash) {
            throw duplicateKeyError();
        }
    }
}

export function createMongoFilesRepository(prefix = "") {
    const collection = new FakeFilesCollection();
    const requestedNames: string[] = [];
    const db = {
        collection(name: string) {
            requestedNames.push(name);
            return collection;
        },
    } as unknown as Db;
    return { collection, repository: new MongoCmsFilesMetadata(db, { collectionPrefix: prefix }), requestedNames };
}

function matches(document: FileDocument, filter: Filter): boolean {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = document[key as keyof FileDocument];
        if (expected && typeof expected === "object" && "$in" in expected) {
            return (expected.$in as unknown[]).includes(actual);
        }
        if (expected && typeof expected === "object" && "$regex" in expected) {
            return new RegExp(String(expected.$regex), String(expected.$options ?? "")).test(String(actual));
        }
        return actual === expected;
    });
}

function compare(left: unknown, right: unknown): number {
    return left === right ? 0 : left! < right! ? -1 : 1;
}

function duplicateKeyError(): Error & { code: number } {
    return Object.assign(new Error("duplicate key"), { code: 11000 });
}
