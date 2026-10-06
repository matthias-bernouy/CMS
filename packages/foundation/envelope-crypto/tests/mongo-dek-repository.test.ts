import { describe, expect, test } from "bun:test";
import { MongoDekRepository, type CmsDekDocument } from "@bernouy/envelope-crypto/mongo";
import type { Collection, Filter, UpdateFilter } from "mongodb";

describe("MongoDekRepository KEK compatibility", () => {
    test("maps pre-versioning rows to legacy and rewraps them with compare-and-swap", async () => {
        let document: CmsDekDocument = {
            _id: "tenant-a",
            wrapped: "old-wrapped",
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
                if (filter.wrapped !== document.wrapped) {
                    return { modifiedCount: 0 };
                }
                document = { ...document, ...(update.$set as Partial<CmsDekDocument>) };
                return { modifiedCount: 1 };
            },
        } as unknown as Collection<CmsDekDocument>;
        const repository = new MongoDekRepository(collection, { createIndexes: false });

        expect((await repository.get("tenant-a"))?.keyId).toBe("legacy");
        expect(
            await repository.rewrap(
                "tenant-a",
                { wrapped: "old-wrapped", keyId: "legacy" },
                { wrapped: "new-wrapped", keyId: "2026-10", rotatedAt: new Date("2026-10-01T00:00:00.000Z") },
            ),
        ).toBe(true);
        expect(capturedFilter).toMatchObject({
            _id: "tenant-a",
            wrapped: "old-wrapped",
            $or: [{ keyId: "legacy" }, { keyId: { $exists: false } }],
        });
        expect(document).toMatchObject({ wrapped: "new-wrapped", keyId: "2026-10" });
        expect(
            await repository.rewrap(
                "tenant-a",
                { wrapped: "old-wrapped", keyId: "legacy" },
                { wrapped: "lost-update", keyId: "other", rotatedAt: new Date() },
            ),
        ).toBe(false);
        expect(document.wrapped).toBe("new-wrapped");
    });
});
