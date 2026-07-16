import { describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { IdentityAliasConflictError } from "@bernouy/cms-identities";
import { MongoIdentityService } from "@bernouy/cms-identities/mongo";
import { identityServiceContract } from "./identityService.contract";

type IdentityDoc = {
    subjectId: string;
    authority: string;
    kind: "user";
    value: string | number;
    aliasKey: string;
    subjectAuthorityKey: string;
};

type IdentityFilter = Partial<Pick<IdentityDoc, "aliasKey" | "subjectAuthorityKey">>;

identityServiceContract("Mongo", () => createService(new FakeIdentityCollection()));

describe("Mongo identity persistence", () => {
    test("creates unique indexes for both sides of a binding", async () => {
        const collection = new FakeIdentityCollection();
        await createService(collection).init();

        expect(collection.indexes).toEqual([
            { key: "aliasKey", unique: true },
            { key: "subjectAuthorityKey", unique: true },
        ]);
    });

    test("accepts a duplicate-key race when the winning binding is identical", async () => {
        const collection = new FakeIdentityCollection("identical");
        const identities = createService(collection);

        await expect(identities.bind("subject-1", {
            authority: "commerce",
            kind: "user",
            value: 184,
        })).resolves.toBeUndefined();
        expect(await identities.resolve({ authority: "commerce", kind: "user", value: 184 }, "cms"))
            .toBe("subject-1");
    });

    test("returns an opaque conflict after a conflicting duplicate-key race", async () => {
        const collection = new FakeIdentityCollection("conflicting");
        const identities = createService(collection);

        const error = await identities.bind("subject-1", {
            authority: "private-provider",
            kind: "user",
            value: "private-alias",
        }).then(() => null, caught => caught);

        expect(error).toBeInstanceOf(IdentityAliasConflictError);
        expect(error.message).toBe("Identity alias conflicts with an existing binding");
        expect(JSON.stringify(error)).not.toContain("private-provider");
        expect(JSON.stringify(error)).not.toContain("private-alias");
    });
});

type DuplicateRace = "identical" | "conflicting";

class FakeIdentityCollection {
    readonly indexes: Array<{ key: string; unique: boolean }> = [];
    private readonly docs: IdentityDoc[] = [];
    private duplicateRace?: DuplicateRace;

    constructor(duplicateRace?: DuplicateRace) {
        this.duplicateRace = duplicateRace;
    }

    async createIndex(index: Record<string, number>, options: { unique?: boolean }): Promise<string> {
        const key = Object.keys(index)[0];
        if (!key) throw new Error("An index key is required");
        this.indexes.push({ key, unique: options.unique === true });
        return key;
    }

    async updateOne(
        filter: IdentityFilter,
        update: { $setOnInsert: IdentityDoc },
        _options: { upsert?: boolean },
    ): Promise<void> {
        if (this.docs.some(doc => matches(doc, filter))) return;

        const candidate = structuredClone(update.$setOnInsert);
        if (this.duplicateRace) {
            const race = this.duplicateRace;
            this.duplicateRace = undefined;
            this.docs.push(race === "identical"
                ? candidate
                : { ...candidate, value: "competing-alias", aliasKey: "competing-key" });
            throw duplicateKeyError();
        }

        if (this.docs.some(doc => doc.aliasKey === candidate.aliasKey
            || doc.subjectAuthorityKey === candidate.subjectAuthorityKey)) {
            throw duplicateKeyError();
        }
        this.docs.push(candidate);
    }

    async findOne(filter: IdentityFilter): Promise<IdentityDoc | null> {
        return this.docs.find(doc => matches(doc, filter)) ?? null;
    }
}

function createService(collection: FakeIdentityCollection): MongoIdentityService {
    const db = { collection: () => collection } as unknown as Db;
    return new MongoIdentityService(db);
}

function matches(doc: IdentityDoc, filter: IdentityFilter): boolean {
    return Object.entries(filter).every(([key, value]) => doc[key as keyof IdentityDoc] === value);
}

function duplicateKeyError(): Error & { code: number } {
    return Object.assign(new Error("duplicate key"), { code: 11000 });
}
