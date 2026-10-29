import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { request, resource, loader, barrier } from "./fixture";

test("a purge detaches old fills and prevents old responses repopulating the cache", async () => {
    const cache = new ResponseCache();
    const gate = barrier();
    let calls = 0;
    const load = async () => {
        const current = ++calls;
        if (current === 1) {
            await gate.promise;
        }
        return resource(`version-${current}`);
    };
    const before = cache.handle(request(), load);
    await Promise.resolve();
    cache.purge();
    expect(await (await cache.handle(request(), load)).text()).toBe("version-2");
    gate.release();
    expect(await (await before).text()).toBe("version-1");
    expect(await (await cache.handle(request(), load)).text()).toBe("version-2");
    expect(calls).toBe(2);
});
test("known revalidations coalesce; fill and waiter capacities bound retained work without rejecting overflow", async () => {
    let now = 0;
    const cache = new ResponseCache({ maxPending: 1, maxWaiters: 2, now: () => now });
    await cache.handle(request(), async () => resource("old", "public, max-age=1"));
    now = 1000;
    const gate = barrier();
    let calls = 0;
    const load = async () => {
        calls++;
        await gate.promise;
        return resource();
    };
    const a = cache.handle(request(), load);
    const b = cache.handle(request(), load);
    const overflow = cache.handle(request(), load);
    const distinct = cache.handle(request("/other"), load);
    expect(cache.snapshot().fills).toBe(1);
    gate.release();
    const responses = await Promise.all([a, b, overflow, distinct]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(responses.map((response) => response.headers.get("x-cache"))).toEqual([
        "MISS",
        "COALESCED",
        "BYPASS",
        "BYPASS",
    ]);
    expect(calls).toBe(3);
    expect(cache.snapshot().fills).toBe(0);
});
test("external changes become visible after 15 seconds; completed commands purge immediately", async () => {
    let now = 0;
    const cache = new ResponseCache({ now: () => now });
    const f = loader();
    await cache.handle(request(), f.load);
    now = 14_999;
    expect(await (await cache.handle(request(), f.load)).text()).toBe("page-1");
    now = 15_000;
    expect(await (await cache.handle(request(), f.load)).text()).toBe("page-2");
    cache.purge();
    expect(await (await cache.handle(request(), f.load)).text()).toBe("page-3");
});
test("unknown outcome writes after a purge are visible within the next shared lifetime", async () => {
    let now = 0;
    let content = "old";
    const cache = new ResponseCache({ now: () => now });
    const load = async () => resource(content);
    await cache.handle(request(), load);
    cache.purge();
    await cache.handle(request(), load);
    now = 1000;
    content = "new";
    now = 15_000;
    expect(await (await cache.handle(request(), load)).text()).toBe("new");
});
test("stale-if-error is explicit, bounded and never survives a purge or a definitive private response", async () => {
    let now = 0;
    const cache = new ResponseCache({ now: () => now });
    const f = loader("public, max-age=1, stale-if-error=5");
    await cache.handle(request(), f.load);
    now = 2000;
    const failed = async () => resource("unavailable", "no-store", 503);
    expect((await cache.handle(request(), failed)).headers.get("x-cache")).toBe("STALE");
    const privateLoad = async () => resource("private", "private, no-store");
    await cache.handle(request(), privateLoad);
    expect((await cache.handle(request(), failed)).status).toBe(503);
    await cache.handle(request(), f.load);
    cache.purge();
    expect((await cache.handle(request(), failed)).status).toBe(503);
});
test("oversized streams remain readable and cancel releases upstream resources", async () => {
    const cache = new ResponseCache({ maxEntryBytes: 64 });
    let cancelled = false;
    let sent = 0;
    const load = async () => ({
        cacheControl: "public, max-age=60",
        response: new Response(
            new ReadableStream<Uint8Array>({
                pull(c) {
                    sent++;
                    c.enqueue(new Uint8Array(80));
                },
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "cache-control": "public, max-age=60", "content-type": "application/octet-stream" } },
        ),
    });
    const result = await cache.handle(request(), load);
    expect(cache.snapshot().entries).toBe(0);
    expect(sent).toBeLessThan(5);
    await result.body!.cancel();
    expect(cancelled).toBe(true);
});
test("entry and total-byte limits bound retention as unrelated paths grow", async () => {
    const cache = new ResponseCache({ maxEntries: 2, maxBytes: 2000, maxEntryBytes: 1000 });
    const f = loader();
    for (let i = 0; i < 20; i++) {
        await cache.handle(request(`/page-${i}`), f.load);
        expect(cache.snapshot().bytes).toBeLessThanOrEqual(2000);
    }
    expect(cache.snapshot().entries).toBeLessThanOrEqual(2);
    for (const options of [{ maxEntries: 0 }, { maxPending: -1 }, { maxBytes: NaN }]) {
        expect(() => new ResponseCache(options)).toThrow();
    }
});

test("targeted purge retains unrelated immutable bytes, clears untagged legacy entries and fences pending fills", async () => {
    const cache = new ResponseCache();
    let calls = 0;
    const load = async (input: Request) => {
        calls++;
        const path = new URL(input.url).pathname;
        return {
            ...resource(path),
            tags: path === "/legacy" ? [] : path === "/asset" ? ["content:immutable"] : ["content:pages"],
        };
    };
    for (const path of ["/page", "/asset", "/legacy"]) {
        await cache.handle(request(path), load);
    }
    cache.purge(["content:pages"]);
    expect((await cache.handle(request("/asset"), load)).headers.get("x-cache")).toBe("HIT");
    for (const path of ["/page", "/legacy"]) {
        expect((await cache.handle(request(path), load)).headers.get("x-cache")).toBe("MISS");
    }
    expect(calls).toBe(5);
});

test("a slow pre-write fill neither renews freshness at completion nor captures later requests", async () => {
    let now = 0;
    const cache = new ResponseCache({ now: () => now });
    const first = barrier();
    let calls = 0;
    const load = async () => {
        const current = ++calls;
        if (current === 1) {
            await first.promise;
        }
        return resource(current === 1 ? "old" : "new");
    };
    const pending = cache.handle(request(), load);
    await Promise.resolve();
    now = 16_000;
    expect(await (await cache.handle(request(), load)).text()).toBe("new");
    first.release();
    expect(await (await pending).text()).toBe("old");
    expect(await (await cache.handle(request(), load)).text()).toBe("new");
    expect(calls).toBe(2);
});
