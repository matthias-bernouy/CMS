import { readFile, rename, writeFile } from "node:fs/promises";
import { deserialize, serialize } from "node:v8";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import { MongoIntegrationInstallationRepository } from "@bernouy/cms-integrations/mongo";

type StoredInstallation = Omit<IntegrationInstallation, "id"> & { _id: string };
type MongoFilter = Record<string, unknown>;

export async function createDurableInstallationRepository(
    path: string,
): Promise<MongoIntegrationInstallationRepository> {
    const collection = new DurableInstallationCollection(path);
    const database = { collection: () => collection } as unknown as ConstructorParameters<
        typeof MongoIntegrationInstallationRepository
    >[0];
    const repository = new MongoIntegrationInstallationRepository(database);
    await repository.init();
    return repository;
}

class DurableInstallationCollection {
    constructor(private readonly path: string) {}

    async createIndex(): Promise<string> {
        return "updatedAt";
    }

    find(): DurableInstallationCursor {
        return new DurableInstallationCursor(this.path);
    }

    async findOne(filter: MongoFilter): Promise<StoredInstallation | null> {
        const documents = await readDocuments(this.path);
        return copy(documents.find((document) => matches(document, filter)) ?? null);
    }

    async insertOne(document: StoredInstallation): Promise<void> {
        const documents = await readDocuments(this.path);
        if (documents.some(({ _id }) => _id === document._id)) {
            throw Object.assign(new Error("duplicate installation"), { code: 11000 });
        }
        documents.push(copy(document)!);
        await writeDocuments(this.path, documents);
    }

    async replaceOne(filter: MongoFilter, replacement: Omit<StoredInstallation, "_id">): Promise<void> {
        const documents = await readDocuments(this.path);
        const index = documents.findIndex((document) => matches(document, filter));
        const next = { _id: stringFilterId(filter), ...copy(replacement)! };
        if (index < 0) {
            documents.push(next);
        } else {
            documents[index] = next;
        }
        await writeDocuments(this.path, documents);
    }

    async findOneAndReplace(
        filter: MongoFilter,
        replacement: Omit<StoredInstallation, "_id">,
    ): Promise<StoredInstallation | null> {
        const documents = await readDocuments(this.path);
        const index = documents.findIndex((document) => matches(document, filter));
        if (index < 0) {
            return null;
        }
        const next = { _id: documents[index]!._id, ...copy(replacement)! };
        documents[index] = next;
        await writeDocuments(this.path, documents);
        return copy(next);
    }
}

class DurableInstallationCursor {
    #direction: 1 | -1 = 1;

    constructor(private readonly path: string) {}

    sort(specification: { updatedAt: 1 | -1 }): this {
        this.#direction = specification.updatedAt;
        return this;
    }

    async toArray(): Promise<StoredInstallation[]> {
        const documents = await readDocuments(this.path);
        return documents.sort(
            (left, right) => (left.updatedAt.getTime() - right.updatedAt.getTime()) * this.#direction,
        );
    }
}

async function readDocuments(path: string): Promise<StoredInstallation[]> {
    try {
        const value = deserialize(await readFile(path)) as { documents?: StoredInstallation[] };
        return Array.isArray(value.documents) ? value.documents : [];
    } catch (error) {
        if (isNotFound(error)) {
            return [];
        }
        throw error;
    }
}

async function writeDocuments(path: string, documents: StoredInstallation[]): Promise<void> {
    const staging = `${path}.next`;
    await writeFile(staging, serialize({ documents }));
    await rename(staging, path);
}

function matches(document: StoredInstallation, filter: MongoFilter): boolean {
    return Object.entries(filter).every(([path, expected]) => {
        const actual = pathValue(document, path);
        if (isExistsFilter(expected)) {
            return expected.$exists === (actual !== undefined);
        }
        if (actual instanceof Date && expected instanceof Date) {
            return actual.getTime() === expected.getTime();
        }
        return actual === expected;
    });
}

function pathValue(document: StoredInstallation, path: string): unknown {
    return path.split(".").reduce<unknown>((value, key) => {
        return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
    }, document);
}

function isExistsFilter(value: unknown): value is { $exists: boolean } {
    return !!value && typeof value === "object" && typeof (value as { $exists?: unknown }).$exists === "boolean";
}

function stringFilterId(filter: MongoFilter): string {
    if (typeof filter._id !== "string") {
        throw new Error("Durable installation fixture requires an exact string _id filter");
    }
    return filter._id;
}

function copy<T>(value: T): T {
    return structuredClone(value);
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
