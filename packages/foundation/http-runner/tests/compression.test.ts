import { describe, expect, test } from "bun:test";
import { cachedResponse, cachedResponseAsync, compress } from "@bernouy/http-runner";
import { bytesEqual, MemCache, reqWithAccept } from "./support/compression";

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

describe("cachedResponse — encoding negotiation", () => {
    const entry = compress("hello world", "text/plain");
    const generate = () => entry;

    test("returns raw bytes when no accept-encoding header", async () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), generate);
        expect(bytesEqual(await response.arrayBuffer(), entry.raw)).toBe(true);
    });

    test("prefers brotli bytes when advertised", async () => {
        const response = cachedResponse(reqWithAccept("br, gzip"), "k", new MemCache(), generate);
        expect(bytesEqual(await response.arrayBuffer(), entry.brotli)).toBe(true);
        expect(response.headers.get("vary")).toBe("Accept-Encoding");
        expect(response.headers.get("etag")).toBe(`"${entry.hash}-br"`);
        expect(bytesEqual(await new Response(entry.brotli as BodyInit).arrayBuffer(), entry.raw)).toBe(false);
    });

    test("falls back to gzip bytes when only gzip is advertised", async () => {
        const response = cachedResponse(reqWithAccept("gzip"), "k", new MemCache(), generate);
        expect(bytesEqual(await response.arrayBuffer(), entry.gzip)).toBe(true);
        expect(response.headers.get("vary")).toBe("Accept-Encoding");
        expect(response.headers.get("etag")).toBe(`"${entry.hash}-gzip"`);
    });

    test("caches the generated entry across calls", () => {
        const cache = new MemCache();
        let generateCalls = 0;
        const generateOnce = () => {
            generateCalls++;
            return compress("x", "text/plain");
        };

        cachedResponse(reqWithAccept(null), "k", cache, generateOnce);
        cachedResponse(reqWithAccept("br"), "k", cache, generateOnce);
        cachedResponse(reqWithAccept("gzip"), "k", cache, generateOnce);

        expect(generateCalls).toBe(1);
        expect(cache.setCalls).toBe(1);
        expect(cache.getCalls).toBe(3);
    });

    test("supports a custom body status", async () => {
        const response = cachedResponse(reqWithAccept(null), "k", new MemCache(), generate, undefined, {
            status: 404,
        });
        expect(response.status).toBe(404);
        expect(bytesEqual(await response.arrayBuffer(), entry.raw)).toBe(true);
    });

    test("custom status does not override ETag revalidation", () => {
        const cache = new MemCache();
        const first = cachedResponse(reqWithAccept(null), "k", cache, generate, undefined, { status: 404 });
        const request = new Request("http://localhost/", {
            headers: { "if-none-match": first.headers.get("etag")! },
        });
        const response = cachedResponse(request, "k", cache, generate, undefined, { status: 404 });
        expect(response.status).toBe(304);
        expect(response.headers.get("vary")).toBe("Accept-Encoding");
    });

    test("rejects statuses that cannot carry a body", () => {
        expect(() =>
            cachedResponse(reqWithAccept(null), "k", new MemCache(), generate, undefined, { status: 204 }),
        ).toThrow(RangeError);
        expect(() =>
            cachedResponse(reqWithAccept(null), "k", new MemCache(), generate, undefined, { status: 304 }),
        ).toThrow(RangeError);
    });

    test("rejects bodyless custom status before conditional handling", () => {
        const request = new Request("http://localhost/", {
            headers: { "if-none-match": `"${entry.hash}-identity"` },
        });
        expect(() => cachedResponse(request, "k", new MemCache(), generate, undefined, { status: 304 })).toThrow(
            RangeError,
        );
    });
});

describe("cachedResponseAsync", () => {
    test("awaits the generator and caches the result", async () => {
        const cache = new MemCache();
        let generateCalls = 0;
        const generate = async () => {
            generateCalls++;
            await Promise.resolve();
            return compress("async body", "text/html");
        };

        const first = await cachedResponseAsync(reqWithAccept(null), "k", cache, generate);
        const second = await cachedResponseAsync(reqWithAccept(null), "k", cache, generate);
        expect(generateCalls).toBe(1);
        expect(await first.text()).toBe("async body");
        expect(await second.text()).toBe("async body");
    });
});
