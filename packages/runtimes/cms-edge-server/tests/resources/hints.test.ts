import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { NonCacheHints } from "../../src/runtime/resources/cache/hints";
import { barrier, request, resource } from "./fixture";

test("known uncacheable resources start concurrent origin requests immediately and recover after purge or expiry", async () => {
    let now = 0;
    const cache = new ResponseCache({ now: () => now });
    await cache.handle(request(), async () => resource("first", "public, no-cache"));
    const gate = barrier();
    let calls = 0;
    const load = async () => {
        calls++;
        await gate.promise;
        return resource("direct", "public, no-cache");
    };
    const a = cache.handle(request(), load);
    const b = cache.handle(request(), load);
    expect(calls).toBe(2);
    expect(cache.snapshot().fills).toBe(0);
    gate.release();
    for (const response of await Promise.all([a, b])) {
        expect(response.headers.get("x-cache")).toBe("BYPASS");
    }
    cache.purge();
    expect(cache.snapshot().hints.entries).toBe(0);
    expect((await cache.handle(request(), async () => resource())).headers.get("x-cache")).toBe("MISS");
    cache.purge();
    await cache.handle(request(), async () => resource("first", "public, no-cache"));
    now = 5000;
    expect((await cache.handle(request(), async () => resource())).headers.get("x-cache")).toBe("MISS");
});

test("hints bound entries and UTF-8 bytes; a pre-purge fill cannot mark a new generation uncacheable", async () => {
    const hints = new NonCacheHints(() => 0);
    for (let index = 0; index < 300; index++) {
        hints.set(`${index}-${"é".repeat(7000)}`);
        expect(hints.snapshot().bytes).toBeLessThanOrEqual(256 * 1024);
        expect(hints.snapshot().entries).toBeLessThanOrEqual(128);
    }
    hints.set("x".repeat(20_000));
    expect(hints.has("x".repeat(20_000))).toBe(false);
    const cache = new ResponseCache();
    const gate = barrier();
    const old = cache.handle(request(), async () => {
        await gate.promise;
        return resource("private", "private, no-store");
    });
    await Promise.resolve();
    cache.purge();
    await cache.handle(request(), async () => resource("current"));
    gate.release();
    await old;
    expect(cache.snapshot().hints.entries).toBe(0);
    expect(await (await cache.handle(request(), async () => resource("unexpected"))).text()).toBe("current");
});

test("the first concurrent visitors of an unknown uncacheable resource do not queue then reload", async () => {
    const cache = new ResponseCache();
    const gate = barrier();
    let calls = 0;
    const load = async () => {
        calls++;
        await gate.promise;
        return resource("direct", "private, no-store");
    };
    const first = cache.handle(request(), load);
    await Promise.resolve();
    const second = cache.handle(request(), load);
    expect(calls).toBe(2);
    gate.release();
    const responses = await Promise.all([first, second]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(calls).toBe(2);
    expect(cache.snapshot().entries).toBe(0);
});
