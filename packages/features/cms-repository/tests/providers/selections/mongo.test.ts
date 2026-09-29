import { expect, test } from "bun:test";
import type { Db } from "mongodb";
import { MongoContractSelectionStore } from "@bernouy/cms-repository/providers/mongo";
import { graphFixture, siteId } from "./fixtures";

type Document = { _id: string; revision: number; siteId: string };

class Collection {
    readonly documents = new Map<string, Document>();

    async findOne(filter: { _id: string }): Promise<Document | null> {
        const value = this.documents.get(filter._id);
        return value ? structuredClone(value) : null;
    }

    async insertOne(value: Document): Promise<void> {
        this.documents.set(value._id, structuredClone(value));
    }

    async replaceOne(filter: { _id: string; revision: number }, value: Document): Promise<{ matchedCount: number }> {
        const current = this.documents.get(filter._id);
        if (!current || current.revision !== filter.revision) {
            return { matchedCount: 0 };
        }
        this.documents.set(filter._id, { ...structuredClone(value), _id: filter._id });
        return { matchedCount: 1 };
    }
}

test("Mongo selections survive adapter recreation and reject stale revisions", async () => {
    const graph = await graphFixture();
    const collection = new Collection();
    const db = { collection: () => collection } as unknown as Db;
    const dependencies = {
        capture: async () => ({ ...graph.context, revision: "dependencies:1" }),
        isCurrent: async (_site: string, revision: string) => revision === "dependencies:1",
    };
    const first = new MongoContractSelectionStore(db, dependencies);
    const payment = await graph.select("payment");
    const stored = await first.replace(siteId, [payment], 0);
    const recreated = new MongoContractSelectionStore(db, dependencies);
    expect(await recreated.get(siteId)).toEqual(stored);
    expect((await recreated.get(siteId))?.plan.selections).toEqual([payment]);
    await expect(recreated.replace(siteId, [await graph.select("commerce")], 1)).rejects.toMatchObject({
        code: "missing_dependency",
    });
    const cleared = await first.replace(siteId, [], 1);
    expect(cleared.revision).toBe(2);
    await expect(recreated.replace(siteId, [], 1)).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await first.get(siteId)).toEqual(cleared);
});

test("Mongo selections reject a generated plan that would fail the stored document limit", async () => {
    const graph = await graphFixture();
    const collection = new Collection();
    const db = { collection: () => collection } as unknown as Db;
    const store = new MongoContractSelectionStore(
        db,
        {
            capture: async () => ({ ...graph.context, revision: "dependencies:1" }),
            isCurrent: async () => true,
        },
        { maxDocumentBytes: 50, maxJsonDepth: 16, maxSelections: 128, maxInstallations: 256, maxDependencies: 8192 },
    );
    await expect(store.replace(siteId, [], 0)).rejects.toMatchObject({ code: "limit_exceeded" });
    expect(collection.documents.size).toBe(0);
});
