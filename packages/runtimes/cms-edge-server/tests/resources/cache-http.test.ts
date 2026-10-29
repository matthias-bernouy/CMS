import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { request, loader, resource } from "./fixture";

test("public hits, conditional GET and HEAD perform no additional Provider work", async () => {
    const cache = new ResponseCache();
    const f = loader();
    expect(await (await cache.handle(request(), f.load)).text()).toBe("page-1");
    const hit = await cache.handle(request(), f.load);
    expect(hit.headers.get("x-cache")).toBe("HIT");
    expect(await hit.text()).toBe("page-1");
    expect(f.calls()).toBe(1);
    expect((await cache.handle(request("/page", { "if-none-match": '"version"' }), f.load)).status).toBe(304);
    const head = await cache.handle(request("/page", {}, "HEAD"), f.load);
    expect(await head.text()).toBe("");
    expect(head.headers.get("content-length")).toBe("6");
    expect(f.calls()).toBe(1);
});
test("misses strip conditional headers and negotiate gzip independently of cache identity", async () => {
    const cache = new ResponseCache();
    let calls = 0;
    const load = async (input: Request) => {
        calls++;
        expect(input.method).toBe("GET");
        expect(input.headers.has("if-none-match")).toBe(false);
        expect(input.headers.has("accept-encoding")).toBe(false);
        return resource("hello");
    };
    expect((await cache.handle(request("/page", { "if-none-match": '"version"' }), load)).status).toBe(304);
    const gzip = await cache.handle(request("/page", { "accept-encoding": "gzip" }), load);
    expect(gzip.headers.get("content-encoding")).toBe("gzip");
    expect(gzip.headers.get("etag")).toBe('W/"version"');
    const decoded = await new Response(gzip.body!.pipeThrough(new DecompressionStream("gzip"))).text();
    expect(decoded).toBe("hello");
    expect(
        (await cache.handle(request("/page", { "accept-encoding": "gzip;q=0" }), load)).headers.get("content-encoding"),
    ).toBeNull();
    expect(calls).toBe(1);
});
test("credentials, ranges, private responses, errors and redirects never populate the cache", async () => {
    for (const headers of [
        { cookie: "cms-session=secret" },
        { authorization: "Bearer secret" },
        { range: "bytes=0-1" },
        { "if-range": '"version"' },
    ]) {
        const cache = new ResponseCache();
        const f = loader();
        await cache.handle(request("/page", headers), f.load);
        await cache.handle(request("/page", headers), f.load);
        expect(f.calls()).toBe(2);
        expect(cache.snapshot().entries).toBe(0);
    }
    for (const [policy, status] of [
        ["private, no-store", 200],
        ["public, no-cache", 200],
        ["public=1, max-age=15", 200],
        ["public, max-age", 200],
        ["public, max-age=15, immutable=1", 200],
        ["public, max-age=15, max-age=30", 200],
        ["public, max-age=15", 404],
        ["public, max-age=15", 503],
        ["public, max-age=15", 302],
    ] as const) {
        const cache = new ResponseCache();
        let calls = 0;
        const load = async () => {
            calls++;
            return resource("result", policy, status);
        };
        expect((await cache.handle(request(), load)).status).toBe(status);
        await cache.handle(request(), load);
        expect(calls).toBe(2);
        expect(cache.snapshot().entries).toBe(0);
    }
});
test("ordered query, media and language distinguish responses; arbitrary headers cannot alter the cache key", async () => {
    const cache = new ResponseCache();
    const f = loader();
    for (const req of [
        request("/page?a=1&a=2"),
        request("/page?a=2&a=1"),
        request("/page", { accept: "text/html" }),
        request("/page", { "accept-language": "fr" }),
    ]) {
        await cache.handle(req, f.load);
    }
    expect(f.calls()).toBe(4);
    await cache.handle(request("/page?a=1&a=2", { "x-untrusted": "value" }), f.load);
    expect(f.calls()).toBe(4);
});
test("HEAD misses forward HEAD and do not fill; private actors cannot cache a public-looking response", async () => {
    const cache = new ResponseCache();
    let method = "";
    await cache.handle(request("/new", {}, "HEAD"), async (req) => {
        method = req.method;
        return resource();
    });
    expect(method).toBe("HEAD");
    expect(cache.snapshot().entries).toBe(0);
    const f = loader();
    await cache.handle(request(), f.load, false);
    expect(cache.snapshot().entries).toBe(0);
});

test("a cache entry never turns a partial or bodyless upstream response into a full resource", async () => {
    for (const status of [206, 304]) {
        const cache = new ResponseCache();
        const load = async () => ({
            response: new Response(status === 304 ? null : "part", {
                status,
                headers: { "cache-control": "public, max-age=3600, immutable" },
            }),
            cacheControl: "public, max-age=3600, immutable",
        });
        expect((await cache.handle(request(), load)).status).toBe(status);
        expect(cache.snapshot().entries).toBe(0);
    }
});
