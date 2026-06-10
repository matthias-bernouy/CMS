import { describe, test, expect } from "bun:test";
import type { CacheEntry } from "@bernouy/http-runner";
import { TtlCache } from "@bernouy/http-runner";

const entry = (s: string): CacheEntry => {
    const raw = new TextEncoder().encode(s);
    return { raw, brotli: raw, gzip: raw, contentType: "text/html", hash: "h" };
};

describe("TtlCache", () => {
    test("serves a fresh entry within the TTL, then expires it", () => {
        let t = 1000;
        const cache = new TtlCache({ ttlMs: 100, now: () => t });
        cache.set("page:/a", entry("A"));

        expect(cache.get("page:/a")?.raw).toEqual(entry("A").raw); // fresh
        t += 99;
        expect(cache.get("page:/a")).not.toBeNull();               // still inside the window
        t += 2;                                                     // past 100ms now
        expect(cache.get("page:/a")).toBeNull();                   // expired → forces a re-render
    });

    test("a re-set after expiry starts a fresh window", () => {
        let t = 0;
        const cache = new TtlCache({ ttlMs: 10, now: () => t });
        cache.set("k", entry("x"));
        t = 100;
        expect(cache.get("k")).toBeNull();        // expired + dropped
        cache.set("k", entry("y"));               // fresh window from t=100
        expect(cache.get("k")?.raw).toEqual(entry("y").raw);
    });

    test("delete + deleteMatching are unaffected by the TTL", () => {
        const cache = new TtlCache({ ttlMs: 10_000, now: () => 0 });
        cache.set("page:/a", entry("a"));
        cache.set("page:/b", entry("b"));
        cache.set("bloc:x",  entry("c"));

        cache.delete("page:/a");
        expect(cache.get("page:/a")).toBeNull();

        cache.deleteMatching(k => k.startsWith("page:"));
        expect(cache.get("page:/b")).toBeNull();
        expect(cache.get("bloc:x")).not.toBeNull(); // non-page entry kept
    });

    test("bypass mode disables the cache entirely (get null, set no-op)", () => {
        const cache = new TtlCache({ ttlMs: 10_000, bypass: true, now: () => 0 });
        cache.set("page:/a", entry("a"));
        expect(cache.get("page:/a")).toBeNull();
    });
});
