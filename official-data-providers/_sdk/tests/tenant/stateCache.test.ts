import { test, expect } from "bun:test";
import { createStateCache } from "src/core/tenant/stateCache";
import type { ResolvedIssuer } from "src/types/ResolvedIssuer";

const hit: ResolvedIssuer = { role: "tenant", tenant: null };

test("stateCache: size-bounded — random-iss spray can't grow the map unbounded", async () => {
    let loads = 0;
    const cache = createStateCache({
        now: () => 1000,
        ttlSeconds: 30,
        maxEntries: 10,
        load: async () => { loads++; return null; },   // unknown iss → negative entry
    });

    // 100 distinct (attacker) issuers, all resolving negative.
    for (let i = 0; i < 100; i++) await cache.get(`https://evil-${i}.example`);
    expect(loads).toBe(100);

    // The earliest issuers were evicted (cap = 10), so they reload on re-query
    // rather than being served from an ever-growing map.
    await cache.get("https://evil-0.example");
    expect(loads).toBe(101);
});

test("stateCache: TTL hit served from cache (no reload within TTL)", async () => {
    let loads = 0;
    let t = 1000;
    const cache = createStateCache({
        now: () => t, ttlSeconds: 30, maxEntries: 10,
        load: async () => { loads++; return hit; },
    });
    expect(await cache.get("https://ok.example")).toEqual(hit);
    expect(await cache.get("https://ok.example")).toEqual(hit);   // cached
    expect(loads).toBe(1);
    t = 1031;                                                     // past TTL
    await cache.get("https://ok.example");
    expect(loads).toBe(2);
});
