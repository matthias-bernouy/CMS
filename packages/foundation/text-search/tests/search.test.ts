import { expect, test } from "bun:test";
import {
    lexicalRanking,
    normalizedVector,
    semanticRanking,
    fusedRanking,
    MemoryVectorStore,
    VectorIndex,
} from "@bernouy/text-search";

test("lexical identifiers and accented text remain searchable while unrelated terms yield no hit", () => {
    const texts = ["Product catalogue example.orders", "Galerie de photos", "Révisions de page"];
    expect(lexicalRanking(texts, "example.orders")).toEqual([0]);
    expect(lexicalRanking(texts, "revisions")).toEqual([2]);
    expect(lexicalRanking(texts, "missing")).toEqual([]);
    expect(
        semanticRanking(
            [
                [0, 3],
                [4, 0],
            ],
            [2, 0],
        ),
    ).toEqual([1, 0]);
    expect(fusedRanking([1, 0], [1, 2])[0]).toBe(1);
    expect(() => normalizedVector([Number.NaN])).toThrow();
    expect(() => normalizedVector([0, 0])).toThrow();
    expect(() => semanticRanking([[1, 0, 0]], [1, 0])).toThrow();
});

test("bounded vector caches snapshot values and evict entries", async () => {
    const cache = new MemoryVectorStore(2);
    const vector = [1, 0];
    await cache.put([{ key: "one", vector }]);
    vector[0] = 0;
    expect((await cache.get(["one"])).get("one")).toEqual([1, 0]);
    await cache.put([
        { key: "two", vector: [0, 1] },
        { key: "three", vector: [1, 0] },
    ]);
    expect([...(await cache.get(["one", "two", "three"])).keys()]).toEqual(["two", "three"]);
    await expect(cache.put([{ key: "invalid", vector: [Infinity] }])).rejects.toThrow();
    expect(() => new MemoryVectorStore(0)).toThrow();
});

test("text vector indexes reuse content under new corpus revisions and distinguish models", async () => {
    const calls: string[] = [];
    const model = {
        model: "model-v1",
        embed: async (texts: readonly string[]) => {
            calls.push(...texts);
            return texts.map(() => [1, 0]);
        },
    };
    const cache = new MemoryVectorStore();
    const first = new VectorIndex(model, cache);
    expect(await first.prepare("first", ["one", "two"])).toEqual({ embedded: 2, reused: 0 });
    expect(await first.prepare("second", ["one", "two", "three"])).toEqual({ embedded: 1, reused: 2 });
    await first.close();
    const restarted = new VectorIndex(model, cache);
    expect(await restarted.prepare("second", ["one", "two", "three"])).toEqual({ embedded: 0, reused: 3 });
    await restarted.close();
    const changed = new VectorIndex({ ...model, model: "model-v2" }, cache);
    expect(await changed.prepare("second", ["one", "two", "three"])).toEqual({ embedded: 3, reused: 0 });
    await changed.close();
    expect(calls).toHaveLength(6);
});

test("a cold vector index embeds identical passages only once and scatters the result across batches", async () => {
    const calls: string[] = [];
    const model = {
        model: "deduplicated",
        embed: async (texts: readonly string[]) => {
            calls.push(...texts);
            return texts.map(() => [1, 0]);
        },
    };
    const index = new VectorIndex(model, new MemoryVectorStore());
    const texts = ["shared", ...Array.from({ length: 20 }, (_, number) => `unique-${number}`), "shared"];
    try {
        expect(await index.prepare("first", texts)).toEqual({ embedded: 21, reused: 1 });
        expect(calls.filter((text) => text === "shared")).toHaveLength(1);
        expect(index.get("first")).toHaveLength(22);
        expect(index.get("first")?.[0]).toEqual(index.get("first")?.[21]);
        expect(await index.prepare("second", ["shared", "shared"])).toEqual({ embedded: 0, reused: 2 });
        expect(calls).toHaveLength(21);
    } finally {
        await index.close();
    }
});
