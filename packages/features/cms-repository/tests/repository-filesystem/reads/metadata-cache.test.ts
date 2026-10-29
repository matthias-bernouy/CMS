import { expect, test } from "bun:test";
import { ImmutableJsonCache } from "../../../src/repository/filesystem/core/immutableJsonCache";

test("metadata cache projections do not clone or expose the full cached document", () => {
    const cache = new ImmutableJsonCache<{ small: { count: number }; large: number[] }>();
    const value = { small: { count: 1 }, large: Array.from({ length: 100 }, (_, i) => i) };
    cache.set("a", "canonical", value);
    value.small.count = 99;
    const selected = cache.project("a", "canonical", (stored) => stored.small)!;
    expect(selected).toEqual({ count: 1 });
    selected.count = 5;
    expect(cache.project("a", "canonical", (stored) => stored.small)).toEqual({ count: 1 });
    expect(cache.project("a", "changed bytes", (stored) => stored.small)).toBeNull();
    expect(cache.get("a", "canonical")).toBeNull();
});

test("metadata cache evicts by payload budget and does not retain oversized entries", () => {
    const cache = new ImmutableJsonCache<string>(10, 20);
    cache.set("a", "123", "123");
    cache.set("b", "123", "123");
    expect(cache.get("a", "123")).toBeNull();
    expect(cache.get("b", "123")).toBe("123");
    cache.set("large", "x".repeat(100), "large");
    expect(cache.get("large", "x".repeat(100))).toBeNull();
});
