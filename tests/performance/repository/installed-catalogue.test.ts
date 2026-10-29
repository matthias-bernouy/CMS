import { expect, test } from "bun:test";
import {
    CollectionStore,
    type CollectionStorage,
    type CollectionSiteState,
} from "@bernouy/cms-repository/collections/installations";
import { MongoCollectionStorage } from "@bernouy/cms-repository/collections/mongo";
import type { Db } from "mongodb";

const digest = `sha256:${"a".repeat(64)}`;
const summary = {
    digest,
    publisherId: "example.official",
    collectionId: "example",
    version: "1.0.0",
    blocCount: 2,
    exampleCount: 3,
    assetCount: 4,
    textCount: 5,
    themeTokenCount: 6,
    configurable: false,
};

test("installed catalogue reads only current site state and one summary batch; no assets or examples", async () => {
    let state: CollectionSiteState = {
        revision: 1,
        installations: [{ collectionId: "example", digest, configuration: {}, textOverrides: {} }],
    };
    let siteReads = 0;
    let summaryReads = 0;
    const storage = new Proxy({} as CollectionStorage, {
        get(_target, key) {
            if (key === "readSite") {
                return async (siteId: string) => {
                    siteReads++;
                    return siteId === "a" ? structuredClone(state) : { revision: 0, installations: [] };
                };
            }
            if (key === "getReleaseSummaries") {
                return async (digests: string[]) => {
                    summaryReads++;
                    return digests.length ? [structuredClone(summary)] : [];
                };
            }
            return () => {
                throw new Error(`Unexpected full metadata or asset read: ${String(key)}`);
            };
        },
    });
    const store = new CollectionStore(storage);
    expect(await store.listInstalled("a")).toEqual({ revision: 1, items: [summary] });
    expect(await store.listInstalled("b")).toEqual({ revision: 0, items: [] });
    state = { revision: 2, installations: [] };
    expect(await store.listInstalled("a")).toEqual({ revision: 2, items: [] });
    expect(siteReads).toBe(3);
    expect(summaryReads).toBe(3);
});

test("missing or mismatched installed summaries fail closed", async () => {
    const state = {
        revision: 1,
        installations: [{ collectionId: "example", digest, configuration: {}, textOverrides: {} }],
    };
    for (const summaries of [[], [{ ...summary, collectionId: "other" }]]) {
        const store = new CollectionStore({
            readSite: async () => state,
            getReleaseSummaries: async () => summaries,
        } as unknown as CollectionStorage);
        await expect(store.listInstalled("site")).rejects.toThrow("missing or inconsistent");
    }
});

test("Mongo summary reads use one bounded projection and validate stored identities", async () => {
    const queries: unknown[] = [];
    let row = { _id: digest, ...summary };
    const db = {
        collection: () => ({
            aggregate: (pipeline: unknown) => {
                queries.push(pipeline);
                return { toArray: async () => [row] };
            },
        }),
    } as unknown as Db;
    const storage = new MongoCollectionStorage(db);
    expect(await storage.getReleaseSummaries([digest, digest])).toEqual([summary]);
    expect(queries).toHaveLength(1);
    const pipeline = queries[0] as { $match?: { _id: { $in: string[] } }; $project?: Record<string, unknown> }[];
    expect(pipeline[0]?.$match?._id.$in).toEqual([digest]);
    expect(pipeline[1]?.$project).not.toHaveProperty("release");
    expect(await storage.getReleaseSummaries([])).toEqual([]);
    expect(queries).toHaveLength(1);
    row = { ...row, digest: `sha256:${"b".repeat(64)}` };
    await expect(storage.getReleaseSummaries([digest])).rejects.toThrow("inconsistent");
});
