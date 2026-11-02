import { expect, test } from "bun:test";
import { CmsDocumentation } from "@bernouy/cms-documentation";
import { MongoDocumentationVectors } from "@bernouy/cms-documentation/mongo";
import { fixture } from "./fixture";

test("malformed derived Mongo vectors are rebuilt instead of disabling semantic retrieval", async () => {
    const f = await fixture();
    const rows = new Map<string, number[]>();
    const collection = {
        createIndex: async () => "ttl",
        find: (query: { _id: { $in: string[] } }) => ({
            limit: () => ({
                toArray: async () => query._id.$in.map((_id) => ({ _id, vector: rows.get(_id) ?? [Number.NaN] })),
            }),
        }),
        bulkWrite: async (
            operations: { updateOne: { filter: { _id: string }; update: { $set: { vector: number[] } } } }[],
        ) => {
            for (const operation of operations) {
                rows.set(operation.updateOne.filter._id, operation.updateOne.update.$set.vector);
            }
        },
    };
    const store = new MongoDocumentationVectors({ collection: () => collection } as never);
    const service = new CmsDocumentation(f.source, f.model, store);
    await service.prepare();
    const result = await service.search({ query: "revision" });
    expect(result.mode).toBe("hybrid");
    expect(rows.size).toBeGreaterThan(0);
    expect([...rows.values()].flat().every(Number.isFinite)).toBe(true);
});

test("reading valid active Mongo vectors renews only their approaching expiry", async () => {
    const now = Date.now();
    const updates: { query: unknown; update: unknown }[] = [];
    const collection = {
        createIndex: async () => "ttl",
        find: () => ({
            limit: () => ({
                toArray: async () => [
                    { _id: "used", vector: [1, 0], expiresAt: new Date(now + 86_400_000) },
                    { _id: "corrupt", vector: [Number.NaN], expiresAt: new Date(now + 86_400_000) },
                ],
            }),
        }),
        updateMany: async (query: unknown, update: unknown) => {
            updates.push({ query, update });
        },
    };
    const store = new MongoDocumentationVectors({ collection: () => collection } as never);
    expect([...(await store.get(["used", "corrupt"])).keys()]).toEqual(["used"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.query).toMatchObject({ _id: { $in: ["used"] } });
    expect(updates[0]!.update).toMatchObject({ $set: { expiresAt: expect.any(Date) } });
});

test("a derived-cache setup failure is confined to preparation while reads and lexical lookup remain usable", async () => {
    const f = await fixture();
    const store = new MongoDocumentationVectors({
        collection: () => ({
            createIndex: async () => {
                throw new Error("Derived index unavailable");
            },
        }),
    } as never);
    const service = new CmsDocumentation(f.source, f.model, store);
    await expect(service.prepare()).rejects.toThrow("Derived index unavailable");
    expect((await service.search({ query: "revision" })).mode).toBe("lexical");
    const reference = {
        contractId: f.admission.release.contractId,
        releaseDigest: f.admission.digest,
        path: "guide-0.md",
    };
    expect((await service.get({ reference })).content).toBe(f.texts[0]!);
    await service.close();
});
