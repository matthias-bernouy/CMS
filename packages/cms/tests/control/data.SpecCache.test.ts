import { describe, expect, test } from "bun:test";
import { SpecCache } from "src/control/core/data/SpecCache";
import type { ParsedSpec } from "src/control/core/data/types";

const fakeSpec = (title: string): ParsedSpec => ({
    info: { title, version: "1" },
    paths: {},
    servers: [],
    components: { schemas: {} },
});

describe("SpecCache", () => {
    test("returns null when nothing is cached", () => {
        const cache = new SpecCache();
        expect(cache.get("hub", "abc")).toBe(null);
    });

    test("returns the parsed spec when hash matches", () => {
        const cache = new SpecCache();
        const spec  = fakeSpec("Hub");
        cache.set("hub", "abc", spec);
        expect(cache.get("hub", "abc")).toBe(spec);
    });

    test("returns null when hash differs (stale entry)", () => {
        const cache = new SpecCache();
        cache.set("hub", "abc", fakeSpec("Hub"));
        expect(cache.get("hub", "xyz")).toBe(null);
    });

    test("set overwrites previous entry for the same id", () => {
        const cache = new SpecCache();
        const v1 = fakeSpec("Hub v1");
        const v2 = fakeSpec("Hub v2");
        cache.set("hub", "h1", v1);
        cache.set("hub", "h2", v2);
        expect(cache.get("hub", "h1")).toBe(null);
        expect(cache.get("hub", "h2")).toBe(v2);
        expect(cache.size).toBe(1);
    });

    test("delete drops the entry", () => {
        const cache = new SpecCache();
        cache.set("hub", "h", fakeSpec("Hub"));
        cache.delete("hub");
        expect(cache.get("hub", "h")).toBe(null);
        expect(cache.size).toBe(0);
    });

    test("clear empties everything", () => {
        const cache = new SpecCache();
        cache.set("hub", "h", fakeSpec("a"));
        cache.set("stripe", "s", fakeSpec("b"));
        cache.clear();
        expect(cache.size).toBe(0);
    });

    test("entries for different ids do not interfere", () => {
        const cache = new SpecCache();
        const a = fakeSpec("A");
        const b = fakeSpec("B");
        cache.set("hub", "h", a);
        cache.set("stripe", "s", b);
        expect(cache.get("hub",    "h")).toBe(a);
        expect(cache.get("stripe", "s")).toBe(b);
    });
});
