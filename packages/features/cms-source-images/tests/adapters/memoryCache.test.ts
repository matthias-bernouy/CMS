import { describe, expect, test } from "bun:test";
import { InMemorySourceImageCache, type SourceImageDerivative } from "@bernouy/cms-source-images";

function derivative(label: string, createdAt = Date.now()): SourceImageDerivative {
    return {
        bytes: new TextEncoder().encode(label),
        etag: `"${label}"`,
        contentType: "image/webp",
        width: 64,
        height: 32,
        createdAt,
    };
}

describe("InMemorySourceImageCache", () => {
    test("defensively copies stored and returned bytes", async () => {
        const cache = new InMemorySourceImageCache();
        const value = derivative("one");
        await cache.putDerivative("key", value);
        value.bytes[0] = 0;
        const first = await cache.getDerivative("key");
        expect(new TextDecoder().decode(first!.bytes)).toBe("one");
        first!.bytes[0] = 0;
        expect(new TextDecoder().decode((await cache.getDerivative("key"))!.bytes)).toBe("one");
    });

    test("evicts least-recently-used derivatives by count", async () => {
        const cache = new InMemorySourceImageCache({ maxEntries: 2 });
        await cache.putDerivative("a", derivative("a"));
        await cache.putDerivative("b", derivative("b"));
        await cache.getDerivative("a");
        const write = await cache.putDerivative("c", derivative("c"));
        expect(write.evicted).toBe(1);
        expect(await cache.getDerivative("b")).toBeNull();
        expect(await cache.getDerivative("a")).not.toBeNull();
        expect(await cache.getDerivative("c")).not.toBeNull();
    });

    test("bounds total bytes and reports every eviction", async () => {
        const cache = new InMemorySourceImageCache({ maxBytes: 4 });
        await cache.putDerivative("a", derivative("aaa"));
        const result = await cache.putDerivative("b", derivative("bbb"));
        expect(result.evicted).toBe(1);
        expect(cache.byteSize).toBe(3);
        expect(cache.derivativeCount).toBe(1);
    });

    test("expires derivatives using the configured absolute age", async () => {
        let now = 1_000;
        const cache = new InMemorySourceImageCache({ maxDerivativeAgeMs: 100, now: () => now });
        await cache.putDerivative("key", derivative("value", now));
        now = 1_100;
        expect(await cache.getDerivative("key")).not.toBeNull();
        now = 1_101;
        expect(await cache.getDerivative("key")).toBeNull();
        expect(cache.byteSize).toBe(0);
    });

    test("bounds and expires logical lookup entries independently", async () => {
        let now = 0;
        const cache = new InMemorySourceImageCache({
            maxLookupEntries: 2,
            maxLookupAgeMs: 50,
            now: () => now,
        });
        const lookup = (key: string) => ({ derivativeKey: key, freshUntil: 1_000, createdAt: now });
        await cache.putLookup("a", lookup("derivative-a"));
        await cache.putLookup("b", lookup("derivative-b"));
        await cache.getLookup("a");
        await cache.putLookup("c", lookup("derivative-c"));
        expect(await cache.getLookup("b")).toBeNull();
        expect(await cache.getLookup("a")).not.toBeNull();
        now = 51;
        expect(await cache.getLookup("a")).toBeNull();
    });

    test("deleting missing entries is idempotent", async () => {
        const cache = new InMemorySourceImageCache();
        await cache.deleteDerivative("missing");
        await cache.deleteLookup("missing");
        expect(cache.derivativeCount).toBe(0);
        expect(cache.lookupCount).toBe(0);
    });
});
