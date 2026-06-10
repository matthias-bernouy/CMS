import { describe, test, expect, afterEach } from "bun:test";
import type { CacheEntry } from "@bernouy/cms-shared";
import { DeliveryCache } from "cms-delivery/core/DeliveryCache";

const entry = (s: string): CacheEntry => {
    const raw = new TextEncoder().encode(s);
    return { raw, brotli: raw, gzip: raw, contentType: "text/html", hash: "h" };
};

// `isDev` is read at construction → set MODE before `new DeliveryCache()`.
const savedMode = process.env.MODE;
afterEach(() => { if (savedMode === undefined) delete process.env.MODE; else process.env.MODE = savedMode; });

describe("DeliveryCache TTL", () => {
    test("serves a fresh entry within the TTL, then expires it", () => {
        process.env.MODE = "PROD";
        let t = 1000;
        const cache = new DeliveryCache({ ttlMs: 100, now: () => t });
        cache.set("page:/a", entry("A"));

        expect(cache.get("page:/a")?.raw).toEqual(entry("A").raw); // fresh
        t += 99;
        expect(cache.get("page:/a")).not.toBeNull();               // still inside the window
        t += 2;                                                     // past 100ms now
        expect(cache.get("page:/a")).toBeNull();                   // expired → forces a re-render
    });

    test("a re-set after expiry starts a fresh window", () => {
        process.env.MODE = "PROD";
        let t = 0;
        const cache = new DeliveryCache({ ttlMs: 10, now: () => t });
        cache.set("k", entry("x"));
        t = 100;
        expect(cache.get("k")).toBeNull();        // expired + dropped
        cache.set("k", entry("y"));               // fresh window from t=100
        expect(cache.get("k")?.raw).toEqual(entry("y").raw);
    });

    test("delete + deleteMatching are unaffected by the TTL", () => {
        process.env.MODE = "PROD";
        const cache = new DeliveryCache({ ttlMs: 10_000, now: () => 0 });
        cache.set("page:/a", entry("a"));
        cache.set("page:/b", entry("b"));
        cache.set("bloc:x",  entry("c"));

        cache.delete("page:/a");
        expect(cache.get("page:/a")).toBeNull();

        cache.deleteMatching(k => k.startsWith("page:"));
        expect(cache.get("page:/b")).toBeNull();
        expect(cache.get("bloc:x")).not.toBeNull(); // non-page entry kept
    });

    test("DEV mode bypasses entirely (get null, set no-op)", () => {
        process.env.MODE = "DEV";
        const cache = new DeliveryCache({ ttlMs: 10_000, now: () => 0 });
        cache.set("page:/a", entry("a"));
        expect(cache.get("page:/a")).toBeNull();
    });
});
