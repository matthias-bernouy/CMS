import { describe, expect, test } from "bun:test";
import { compress, getOrGenerateEntryAsync } from "@bernouy/http-runner";
import type { Cache, CacheEntry } from "@bernouy/http-runner";

class TestCache implements Cache {
    readonly store = new Map<string, CacheEntry>();
    getCalls = 0;
    setCalls = 0;

    constructor(private readonly bypass = false) {}

    get(key: string): CacheEntry | null {
        this.getCalls++;
        return this.bypass ? null : this.store.get(key) ?? null;
    }

    set(key: string, entry: CacheEntry): void {
        this.setCalls++;
        if (!this.bypass) this.store.set(key, entry);
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    deleteMatching(predicate: (key: string) => boolean): void {
        for (const key of this.store.keys()) {
            if (predicate(key)) this.store.delete(key);
        }
    }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

describe("getOrGenerateEntryAsync single-flight", () => {
    test("shares one generation across a concurrent wave for the same cache key", async () => {
        const cache = new TestCache();
        const gate = deferred();
        const generated = compress("shared", "text/plain");
        let generateCalls = 0;

        const wave = Array.from({ length: 32 }, () => getOrGenerateEntryAsync("same", cache, async () => {
            generateCalls++;
            await gate.promise;
            return generated;
        }));

        await Promise.resolve();
        expect(generateCalls).toBe(1);
        gate.resolve();

        const results = await Promise.all(wave);
        expect(results.every((entry) => entry === generated)).toBe(true);
        expect(cache.setCalls).toBe(1);
    });

    test("keeps different keys and cache instances independent", async () => {
        const firstCache = new TestCache();
        const secondCache = new TestCache();
        const gate = deferred();
        const started: string[] = [];
        const generate = (id: string) => async () => {
            started.push(id);
            await gate.promise;
            return compress(id, "text/plain");
        };

        const first = getOrGenerateEntryAsync("a", firstCache, generate("first:a"));
        const duplicate = getOrGenerateEntryAsync("a", firstCache, generate("duplicate"));
        const otherKey = getOrGenerateEntryAsync("b", firstCache, generate("first:b"));
        const otherCache = getOrGenerateEntryAsync("a", secondCache, generate("second:a"));

        await Promise.resolve();
        expect(started).toEqual(["first:a", "first:b", "second:a"]);
        gate.resolve();

        const [firstEntry, duplicateEntry] = await Promise.all([first, duplicate, otherKey, otherCache]);
        expect(duplicateEntry).toBe(firstEntry);
        expect(firstCache.setCalls).toBe(2);
        expect(secondCache.setCalls).toBe(1);
    });

    test("clears a rejected generation so the next request can retry", async () => {
        const cache = new TestCache();
        const gate = deferred();
        const failure = new Error("generation failed");
        let generateCalls = 0;
        const fail = async (): Promise<CacheEntry> => {
            generateCalls++;
            await gate.promise;
            throw failure;
        };

        const wave = Array.from({ length: 12 }, () => getOrGenerateEntryAsync("retry", cache, fail));
        await Promise.resolve();
        expect(generateCalls).toBe(1);
        gate.resolve();

        const outcomes = await Promise.allSettled(wave);
        expect(outcomes.every((outcome) => outcome.status === "rejected" && outcome.reason === failure)).toBe(true);
        expect(cache.setCalls).toBe(0);

        const recovered = compress("recovered", "text/plain");
        const result = await getOrGenerateEntryAsync("retry", cache, async () => {
            generateCalls++;
            return recovered;
        });
        expect(result).toBe(recovered);
        expect(generateCalls).toBe(2);
        expect(cache.setCalls).toBe(1);
    });

    test("coalesces each wave without persisting through a bypassed cache", async () => {
        const cache = new TestCache(true);
        let generateCalls = 0;

        const runWave = async (body: string): Promise<void> => {
            const gate = deferred();
            const wave = Array.from({ length: 16 }, () => getOrGenerateEntryAsync("bypass", cache, async () => {
                generateCalls++;
                await gate.promise;
                return compress(body, "text/plain");
            }));
            await Promise.resolve();
            gate.resolve();
            await Promise.all(wave);
        };

        await runWave("first");
        await runWave("second");

        expect(generateCalls).toBe(2);
        expect(cache.setCalls).toBe(2);
        expect(cache.store.size).toBe(0);
    });
});
