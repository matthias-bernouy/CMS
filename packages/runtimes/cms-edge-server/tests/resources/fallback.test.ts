import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { barrier, request, resource } from "./fixture";

test("a seventeenth cold key streams without allocating a cache fill or rejecting the visitor", async () => {
    const cache = new ResponseCache();
    const gate = barrier();
    const loads = Array.from({ length: 16 }, (_, index) =>
        cache.handle(request(`/page-${index}`), async () => {
            await gate.promise;
            return resource();
        }),
    );
    let fill: boolean | undefined;
    const overflow = await cache.handle(request("/overflow"), async (_request, cacheFill) => {
        fill = cacheFill;
        return resource("direct");
    });
    expect(overflow.status).toBe(200);
    expect(await overflow.text()).toBe("direct");
    expect(overflow.headers.get("x-cache")).toBe("BYPASS");
    expect(fill).toBe(false);
    expect(cache.snapshot().fills).toBe(16);
    expect(cache.snapshot().entries).toBe(0);
    gate.release();
    await Promise.all(loads);
    expect(cache.snapshot().fills).toBe(0);
});

test("a stalled fill retains its real capacity but subsequent requests bypass it after 15 seconds", async () => {
    let now = 0;
    let loads = 0;
    const cache = new ResponseCache({ maxPending: 1, now: () => now });
    const gate = barrier();
    const load = async () => {
        if (++loads === 1) {
            await gate.promise;
        }
        return resource(String(loads));
    };
    const stalled = cache.handle(request(), load);
    await Promise.resolve();
    now = 16_000;
    const direct = await cache.handle(request(), load);
    expect(direct.status).toBe(200);
    expect(direct.headers.get("x-cache")).toBe("BYPASS");
    expect(cache.snapshot().fills).toBe(1);
    gate.release();
    await stalled;
    expect(cache.snapshot().entries).toBe(0);
    expect(cache.snapshot().fills).toBe(0);
});

test("uncacheable and oversized misses still revalidate, release the origin stream and retain no response", async () => {
    for (const policy of ["public, no-cache", "public, max-age=60"]) {
        let cancelled = 0;
        const cache = new ResponseCache({ maxEntryBytes: 8 });
        const response = await cache.handle(request("/asset", { "if-none-match": 'W/"version"' }), async (input) => {
            expect(input.headers.has("if-none-match")).toBe(false);
            return {
                cacheControl: policy,
                response: new Response(
                    new ReadableStream({
                        pull(controller) {
                            controller.enqueue(new Uint8Array(32));
                        },
                        cancel() {
                            cancelled++;
                        },
                    }),
                    { headers: { "cache-control": policy, etag: '"version"', "content-length": "32" } },
                ),
            };
        });
        expect(response.status).toBe(304);
        expect(response.body).toBeNull();
        expect(response.headers.get("content-length")).toBeNull();
        expect(cancelled).toBe(1);
        expect(cache.snapshot().entries).toBe(0);
        const next = await cache.handle(request("/asset", { "if-none-match": '"version"' }), async (input) => {
            expect(input.headers.get("if-none-match")).toBe('"version"');
            return { response: new Response(null, { status: 304 }), cacheControl: policy };
        });
        expect(next.status).toBe(304);
    }
});

test("only session credentials and explicit revalidation bypass anonymous caching", async () => {
    const cache = new ResponseCache();
    let loads = 0;
    const load = async () => resource(String(++loads));
    await cache.handle(request("/page", { cookie: "_ga=analytics; consent=yes" }), load);
    expect((await cache.handle(request("/page", { cookie: "_ga=another" }), load)).headers.get("x-cache")).toBe("HIT");
    for (const headers of [
        { cookie: "_ga=x; cms-session=valid-token" },
        { cookie: "cms-session=" },
        { authorization: "Bearer token" },
        { "cache-control": "no-cache" },
    ]) {
        expect((await cache.handle(request("/page", headers), load)).headers.get("x-cache")).toBe("BYPASS");
    }
    expect((await cache.handle(request(), load, false)).headers.get("x-cache")).toBe("BYPASS");
    expect(loads).toBe(6);
});
