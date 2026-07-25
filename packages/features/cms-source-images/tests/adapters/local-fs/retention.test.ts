import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { LocalSourceImageCache } from "@bernouy/cms-source-images/local-fs";
import { derivative, localCacheTestFixture } from "./fixture";

const fixture = localCacheTestFixture();
afterEach(fixture.cleanup);

describe("LocalSourceImageCache retention", () => {
    test("bounds persisted derivatives by entry count", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root, maxEntries: 1 });
        await cache.putDerivative("one", await derivative("one"));
        const result = await cache.putDerivative("two", await derivative("two"));
        expect(result.evicted).toBe(1);
        expect(await cache.getDerivative("one")).toBeNull();
        expect(await cache.getDerivative("two")).not.toBeNull();
    });

    test("expires derivatives and lookup indexes independently", async () => {
        const root = await fixture.cacheRoot();
        let now = 10;
        const cache = new LocalSourceImageCache({
            directory: root,
            maxDerivativeAgeMs: 10,
            maxLookupAgeMs: 5,
            now: () => now,
        });
        await cache.putDerivative("derivative", await derivative("bytes", now));
        await cache.putLookup("lookup", {
            derivativeKey: "derivative",
            freshUntil: 1_000,
            createdAt: now,
        });
        now = 16;
        expect(await cache.getLookup("lookup")).toBeNull();
        expect(await cache.getDerivative("derivative")).not.toBeNull();
        now = 21;
        expect(await cache.getDerivative("derivative")).toBeNull();
    });

    test("removes expired derivatives and lookups during restart", async () => {
        const root = await fixture.cacheRoot();
        const derivativeKey = `derivative-${"a".repeat(64)}`;
        const first = new LocalSourceImageCache({ directory: root, now: () => 10 });
        await first.putDerivative(derivativeKey, await derivative("expired", 10));
        await first.putLookup("freshness-expired", {
            derivativeKey,
            freshUntil: 20,
            createdAt: 10,
        });
        await first.putLookup("retention-expired", {
            derivativeKey,
            freshUntil: 1_000,
            createdAt: 10,
        });
        const restarted = new LocalSourceImageCache({
            directory: root,
            maxDerivativeAgeMs: 10,
            maxLookupAgeMs: 10,
            now: () => 21,
        });

        await restarted.initialize();

        expect(await restarted.getDerivative(derivativeKey)).toBeNull();
        expect(await restarted.getLookup("freshness-expired")).toBeNull();
        expect(await restarted.getLookup("retention-expired")).toBeNull();
        expect(await readdir(join(root, "objects"))).toEqual([]);
        expect(await readdir(join(root, "lookups"))).toEqual([]);
    });

    test("reapplies byte, derivative, and lookup bounds after restart", async () => {
        const root = await fixture.cacheRoot();
        const keys = ["a", "b", "c"].map((suffix) => `derivative-${suffix.repeat(64)}`);
        const first = new LocalSourceImageCache({ directory: root, now: () => 30 });
        await first.putDerivative(keys[0]!, await derivative("1", 10));
        await first.putDerivative(keys[1]!, await derivative("22", 20));
        await first.putDerivative(keys[2]!, await derivative("333", 30));
        for (const [index, derivativeKey] of keys.entries()) {
            await first.putLookup(`lookup-${index}`, {
                derivativeKey,
                freshUntil: 1_000,
                createdAt: (index + 1) * 10,
            });
        }
        const restarted = new LocalSourceImageCache({
            directory: root,
            maxBytes: 4,
            maxEntries: 2,
            maxLookupEntries: 1,
            now: () => 30,
        });

        await restarted.initialize();

        expect(await restarted.getDerivative(keys[0]!)).toBeNull();
        expect(await restarted.getDerivative(keys[1]!)).toBeNull();
        expect(new TextDecoder().decode((await restarted.getDerivative(keys[2]!))!.bytes)).toBe("333");
        expect(await restarted.getLookup("lookup-0")).toBeNull();
        expect(await restarted.getLookup("lookup-1")).toBeNull();
        expect(await restarted.getLookup("lookup-2")).not.toBeNull();
        expect((await readdir(join(root, "objects"))).filter((name) => name.endsWith(".json"))).toHaveLength(1);
        expect((await readdir(join(root, "objects"))).filter((name) => name.endsWith(".webp"))).toHaveLength(1);
        expect(await readdir(join(root, "lookups"))).toHaveLength(1);
    });

    test("rejects invalid lookup freshness before persisting it", async () => {
        const root = await fixture.cacheRoot();
        const cache = new LocalSourceImageCache({ directory: root, now: () => 100 });
        const derivativeKey = `derivative-${"a".repeat(64)}`;

        await expect(
            cache.putLookup("future", {
                derivativeKey,
                createdAt: 101,
                freshUntil: 200,
            }),
        ).rejects.toThrow("current and bounded");
        await expect(
            cache.putLookup("overlong", {
                derivativeKey,
                createdAt: 100,
                freshUntil: 31_536_000_101,
            }),
        ).rejects.toThrow("current and bounded");
        expect(await readdir(join(root, "lookups"))).toEqual([]);
    });
});
