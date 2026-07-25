import type { Db } from "mongodb";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import { MongoIntegrationInstallationRepository } from "@bernouy/cms-integrations/mongo";

export type StoredInstallation = Omit<IntegrationInstallation, "id"> & { _id: string };

type Filter = { _id: string };

class FakeCursor {
    constructor(private readonly documents: StoredInstallation[]) {}

    sort(specification: { updatedAt: 1 | -1 }): this {
        this.documents.sort(
            (left, right) => (left.updatedAt.getTime() - right.updatedAt.getTime()) * specification.updatedAt,
        );
        return this;
    }

    async toArray(): Promise<StoredInstallation[]> {
        return structuredClone(this.documents);
    }
}

export class FakeInstallationCollection {
    private readonly documents = new Map<string, StoredInstallation>();

    async createIndex(): Promise<string> {
        return "updatedAt";
    }

    find(): FakeCursor {
        return new FakeCursor([...this.documents.values()]);
    }

    async findOne(filter: Filter): Promise<StoredInstallation | null> {
        const document = this.documents.get(filter._id);
        return document ? structuredClone(document) : null;
    }

    async insertOne(document: StoredInstallation): Promise<void> {
        this.documents.set(document._id, structuredClone(document));
    }

    async replaceOne(filter: Filter, replacement: Omit<StoredInstallation, "_id">): Promise<void> {
        this.documents.set(filter._id, structuredClone({ _id: filter._id, ...replacement }));
    }

    seed(document: StoredInstallation): void {
        this.documents.set(document._id, structuredClone(document));
    }
}

export function createMongoInstallationRepository() {
    const collection = new FakeInstallationCollection();
    const db = { collection: () => collection } as unknown as Db;
    return { collection, repository: new MongoIntegrationInstallationRepository(db) };
}
