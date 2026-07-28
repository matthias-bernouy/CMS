import { readFile, writeFile } from "node:fs/promises";
import type { IntegrationInstallation, IntegrationMigrationPhase } from "@bernouy/cms-integrations";
import { MongoIntegrationInstallationRepository } from "@bernouy/cms-integrations/mongo";
import { BSON, type Db } from "mongodb";

type StoredInstallation = Omit<IntegrationInstallation, "id"> & { _id: string };
type MongoFilter = Record<string, unknown>;

export async function createBsonInstallationRepository(options: {
    path: string;
    crashAfterSucceededPhase?: IntegrationMigrationPhase;
}): Promise<MongoIntegrationInstallationRepository> {
    const collection = new BsonInstallationCollection(options.path, options.crashAfterSucceededPhase);
    const db = { collection: () => collection } as unknown as Db;
    const repository = new MongoIntegrationInstallationRepository(db);
    await repository.init();
    return repository;
}

class BsonInstallationCollection {
    #crashed = false;

    constructor(
        private readonly path: string,
        private readonly crashAfterSucceededPhase?: IntegrationMigrationPhase,
    ) {}

    async createIndex(): Promise<string> {
        this.assertAlive();
        return "updatedAt";
    }

    find(): BsonInstallationCursor {
        this.assertAlive();
        return new BsonInstallationCursor(this.path);
    }

    async findOne(filter: MongoFilter): Promise<StoredInstallation | null> {
        this.assertAlive();
        const documents = await readDocuments(this.path);
        return copy(documents.find((document) => matches(document, filter)) ?? null);
    }

    async insertOne(document: StoredInstallation): Promise<void> {
        this.assertAlive();
        const documents = await readDocuments(this.path);
        if (documents.some(({ _id }) => _id === document._id)) {
            throw Object.assign(new Error("duplicate installation"), { code: 11000 });
        }
        documents.push(copy(document)!);
        await writeDocuments(this.path, documents);
    }

    async replaceOne(filter: MongoFilter, replacement: Omit<StoredInstallation, "_id">): Promise<void> {
        this.assertAlive();
        const documents = await readDocuments(this.path);
        const index = documents.findIndex((document) => matches(document, filter));
        const id = stringFilterId(filter);
        const next = { _id: id, ...copy(replacement)! };
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
        this.assertAlive();
        const documents = await readDocuments(this.path);
        const index = documents.findIndex((document) => matches(document, filter));
        if (index < 0) {
            return null;
        }
        const previous = documents[index]!;
        const next = { _id: previous._id, ...copy(replacement)! };
        documents[index] = next;
        await writeDocuments(this.path, documents);
        if (this.shouldCrash(previous, next)) {
            this.#crashed = true;
            throw new Error(`simulated composition crash after durable ${this.crashAfterSucceededPhase}`);
        }
        return copy(next);
    }

    private shouldCrash(previous: StoredInstallation, next: StoredInstallation): boolean {
        const phase = this.crashAfterSucceededPhase;
        return !!phase && phaseStatus(previous, phase) !== "succeeded" && phaseStatus(next, phase) === "succeeded";
    }

    private assertAlive(): void {
        if (this.#crashed) {
            throw new Error(`simulated composition crash after durable ${this.crashAfterSucceededPhase}`);
        }
    }
}

class BsonInstallationCursor {
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
        const bytes = await readFile(path);
        const value = BSON.deserialize(bytes) as { documents?: StoredInstallation[] };
        return Array.isArray(value.documents) ? value.documents : [];
    } catch (error) {
        if (isNotFound(error)) {
            return [];
        }
        throw error;
    }
}

async function writeDocuments(path: string, documents: StoredInstallation[]): Promise<void> {
    await writeFile(path, BSON.serialize({ documents }));
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
        throw new Error("BSON installation fixture requires an exact string _id filter");
    }
    return filter._id;
}

function phaseStatus(document: StoredInstallation, phase: IntegrationMigrationPhase): string | undefined {
    return document.migrationOperation?.journal.find((entry) => entry.phase === phase)?.status;
}

function copy<T>(value: T): T {
    return structuredClone(value);
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
