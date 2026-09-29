import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoInstallationIdentityService } from "@bernouy/cms-gateway/mongo";

interface IdentityDocument {
    scopeKey: string;
    subjectKey: string;
    aliasKey: string;
    cmsSubjectId: string;
    providerSubjectId: string;
}

class FakeCollection {
    readonly documents: IdentityDocument[] = [];
    readonly indexes: Array<{ field: string; unique: boolean }> = [];
    duplicateAfterInsert = false;

    async createIndex(fields: Record<string, number>, options?: { unique?: boolean }): Promise<string> {
        const field = Object.keys(fields)[0]!;
        this.indexes.push({ field, unique: options?.unique === true });
        return field;
    }

    async updateOne(filter: Partial<IdentityDocument>, update: { $setOnInsert: IdentityDocument }): Promise<void> {
        if (!this.documents.some((document) => matches(document, filter))) {
            this.documents.push(update.$setOnInsert);
            if (this.duplicateAfterInsert) {
                this.duplicateAfterInsert = false;
                throw Object.assign(new Error("duplicate key"), { code: 11000 });
            }
        }
    }

    async findOne(filter: Partial<IdentityDocument>): Promise<IdentityDocument | null> {
        return this.documents.find((document) => matches(document, filter)) ?? null;
    }

    async deleteMany(filter: Partial<IdentityDocument>): Promise<void> {
        for (let index = this.documents.length - 1; index >= 0; index -= 1) {
            if (matches(this.documents[index]!, filter)) {
                this.documents.splice(index, 1);
            }
        }
    }
}

function matches(document: IdentityDocument, filter: Partial<IdentityDocument>): boolean {
    return Object.entries(filter).every(([field, value]) => document[field as keyof IdentityDocument] === value);
}

test("Mongo identity aliases survive adapter recreation and stay installation-scoped", async () => {
    const collection = new FakeCollection();
    const db = { collection: () => collection } as unknown as Db;
    const first = new MongoInstallationIdentityService(db);
    await first.init();
    expect(collection.indexes).toEqual([
        { field: "subjectKey", unique: true },
        { field: "aliasKey", unique: true },
        { field: "scopeKey", unique: false },
    ]);
    const scope = { siteId: "site-a", installationId: "install-a" };
    const alias = await first.getOrCreate(scope, "cms-user-1");
    const recreated = new MongoInstallationIdentityService(db);
    expect(await recreated.getOrCreate(scope, "cms-user-1")).toBe(alias);
    expect(await recreated.resolve(scope, alias)).toBe("cms-user-1");
    expect(await recreated.resolve({ ...scope, installationId: "install-b" }, alias)).toBeNull();
    await recreated.revoke(scope);
    expect(await first.resolve(scope, alias)).toBeNull();
});

test("Mongo identity creation accepts a concurrent winner", async () => {
    const collection = new FakeCollection();
    collection.duplicateAfterInsert = true;
    const db = { collection: () => collection } as unknown as Db;
    const identities = new MongoInstallationIdentityService(db);
    const scope = { siteId: "site-a", installationId: "install-a" };
    const alias = await identities.getOrCreate(scope, "cms-user-1");
    expect(await identities.resolve(scope, alias)).toBe("cms-user-1");
    expect(collection.documents).toHaveLength(1);
});
