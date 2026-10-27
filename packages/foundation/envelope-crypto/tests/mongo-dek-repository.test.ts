import { describe, expect, test } from "bun:test";
import { MongoDekRepository, type CmsDekDocument } from "@bernouy/envelope-crypto/mongo";
import type { Collection, Filter, UpdateFilter } from "mongodb";

describe("MongoDekRepository explicit KEK identities", () => {
    test("rewraps explicitly identified keys with an exact compare-and-swap", async () => {
        let document: CmsDekDocument = {
            _id: "tenant-a",
            wrapped: "old-wrapped",
            keyId: "key-old",
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
            rotatedAt: null,
        };
        let capturedFilter: Filter<CmsDekDocument> | undefined;
        const collection = {
            async findOne() {
                return document;
            },
            async updateOne(filter: Filter<CmsDekDocument>, update: UpdateFilter<CmsDekDocument>) {
                capturedFilter = filter;
                if (filter.wrapped !== document.wrapped || filter.keyId !== document.keyId) {
                    return { modifiedCount: 0 };
                }
                document = { ...document, ...(update.$set as Partial<CmsDekDocument>) };
                return { modifiedCount: 1 };
            },
        } as unknown as Collection<CmsDekDocument>;
        const repository = new MongoDekRepository(collection, { createIndexes: false });

        expect((await repository.get("tenant-a"))?.keyId).toBe("key-old");
        expect(
            await repository.rewrap(
                "tenant-a",
                { wrapped: "old-wrapped", keyId: "key-old" },
                { wrapped: "new-wrapped", keyId: "2026-10", rotatedAt: new Date("2026-10-01T00:00:00.000Z") },
            ),
        ).toBe(true);
        expect(capturedFilter).toMatchObject({
            _id: "tenant-a",
            wrapped: "old-wrapped",
            keyId: "key-old",
        });
        expect(capturedFilter).not.toHaveProperty("$or");
        expect(document).toMatchObject({ wrapped: "new-wrapped", keyId: "2026-10" });
        expect(
            await repository.rewrap(
                "tenant-a",
                { wrapped: "old-wrapped", keyId: "key-old" },
                { wrapped: "lost-update", keyId: "other", rotatedAt: new Date() },
            ),
        ).toBe(false);
        expect(document.wrapped).toBe("new-wrapped");
    });
});

for (const keyId of [undefined, null, "", 42]) {
    test(`rejects a persisted DEK with invalid keyId ${String(keyId)} on every read path`, async () => {
        const document = { _id: "scope", wrapped: "wrapped", keyId, createdAt: new Date(), rotatedAt: null };
        const collection = {
            findOne: async () => document,
            findOneAndUpdate: async () => document,
            find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => [document] }) }) }),
        } as unknown as Collection<CmsDekDocument>;
        const repository = new MongoDekRepository(collection, { createIndexes: false });
        await expect(repository.get("scope")).rejects.toThrow("explicit nonempty keyId");
        await expect(repository.list(null, 10)).rejects.toThrow("explicit nonempty keyId");
        await expect(
            repository.create({
                scopeId: "scope",
                wrapped: "candidate",
                keyId: "current",
                createdAt: new Date(),
                rotatedAt: null,
            }),
        ).rejects.toThrow("explicit nonempty keyId");
    });
}

test("stored key identifiers remain opaque to the Mongo adapter", async () => {
    const document = {
        _id: "scope",
        wrapped: "opaque",
        keyId: "kms://tenant/keys/current",
        createdAt: new Date(),
        rotatedAt: null,
    };
    const repository = new MongoDekRepository(
        { findOne: async () => document } as unknown as Collection<CmsDekDocument>,
        { createIndexes: false },
    );
    expect((await repository.get("scope"))?.keyId).toBe(document.keyId);
});
