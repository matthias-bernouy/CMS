import { describe, test, expect } from "bun:test";
import { compress, cachedResponse, cachedResponseAsync } from "src/socle/server/compression";
import type { Cache, CacheEntry } from "src/socle/interfaces/Cache";

class MemCache implements Cache {
    store = new Map<string, CacheEntry>();
    getCalls = 0;
    setCalls = 0;
    get(k: string) { this.getCalls++; return this.store.get(k) ?? null; }
    set(k: string, v: CacheEntry) { this.setCalls++; this.store.set(k, v); }
    delete(k: string) { this.store.delete(k); }
    deleteMatching(p: (k: string) => boolean) {
        for (const k of this.store.keys()) if (p(k)) this.store.delete(k);
    }
}

function reqWithAccept(encoding: string | null) {
    return new Request("http://localhost/", {
        headers: encoding ? { "accept-encoding": encoding } : {},
    });
}

describe("compress", () => {
    test("encodes a string and produces all three variants", () => {
        const entry = compress("hello world", "text/plain");
        expect(entry.contentType).toBe("text/plain");
        expect(entry.raw).toBeInstanceOf(Uint8Array);
        expect(entry.brotli).toBeInstanceOf(Uint8Array);
        expect(entry.gzip).toBeInstanceOf(Uint8Array);
        expect(new TextDecoder().decode(entry.raw)).toBe("hello world");
    });

    test("accepts Uint8Array input without re-encoding", () => {
        const input = new TextEncoder().encode("raw bytes");
        const entry = compress(input, "application/octet-stream");
        expect(new TextDecoder().decode(entry.raw)).toBe("raw bytes");
    });
});

function bytesEqual(a: ArrayBuffer, b: Uint8Array): boolean {
    const av = new Uint8Array(a);
    if (av.length !== b.length) return false;
    for (let i = 0; i < av.length; i++) if (av[i] !== b[i]) return false;
    return true;
}

describe("cachedResponse — encoding negotiation", () => {
    const entry = compress("hello world", "text/plain");
    const generate = () => entry;

    test("returns raw bytes when no accept-encoding header", async () => {
        const cache = new MemCache();
        const res = cachedResponse(reqWithAccept(null), "k", cache, generate);
        expect(bytesEqual(await res.arrayBuffer(), entry.raw)).toBe(true);
    });

    test("prefers brotli bytes when advertised", async () => {
        const cache = new MemCache();
        const res = cachedResponse(reqWithAccept("br, gzip"), "k", cache, generate);
        expect(bytesEqual(await res.arrayBuffer(), entry.brotli)).toBe(true);
        // Sanity: brotli should differ from raw for non-trivial inputs.
        expect(bytesEqual(await new Response(entry.brotli as BodyInit).arrayBuffer(), entry.raw)).toBe(false);
    });

    test("falls back to gzip bytes when only gzip is advertised", async () => {
        const cache = new MemCache();
        const res = cachedResponse(reqWithAccept("gzip"), "k", cache, generate);
        expect(bytesEqual(await res.arrayBuffer(), entry.gzip)).toBe(true);
    });

    test("caches the generated entry across calls", () => {
        const cache = new MemCache();
        let generateCalls = 0;
        const gen = () => { generateCalls++; return compress("x", "text/plain"); };

        cachedResponse(reqWithAccept(null), "k", cache, gen);
        cachedResponse(reqWithAccept("br"), "k", cache, gen);
        cachedResponse(reqWithAccept("gzip"), "k", cache, gen);

        expect(generateCalls).toBe(1);
        expect(cache.setCalls).toBe(1);
        expect(cache.getCalls).toBe(3);
    });
});

describe("cachedResponseAsync", () => {
    test("awaits the generator and caches the result", async () => {
        const cache = new MemCache();
        let generateCalls = 0;
        const gen = async () => {
            generateCalls++;
            await Promise.resolve();
            return compress("async body", "text/html");
        };

        const res1 = await cachedResponseAsync(reqWithAccept(null), "k", cache, gen);
        const res2 = await cachedResponseAsync(reqWithAccept(null), "k", cache, gen);

        expect(generateCalls).toBe(1);
        expect(await res1.text()).toBe("async body");
        expect(await res2.text()).toBe("async body");
    });
});
