import { expect, test } from "bun:test";
import { CollectionSourceCache } from "../../../src/capabilities/installations/sources/cache";

test("cache bounds entries, uses LRU ordering and does not retain oversized payloads", async () => {
    const cache = new CollectionSourceCache<string>(2, 10, (value) => value.length);
    const loads: string[] = [];
    const get = (key: string, value = key) =>
        cache.load(key, async () => {
            loads.push(key);
            return value;
        });
    await get("a");
    await get("b");
    await get("a");
    await get("c");
    await get("b");
    expect(loads).toEqual(["a", "b", "c", "b"]);
    await get("large", "x".repeat(11));
    await get("large", "x".repeat(11));
    expect(loads.slice(-2)).toEqual(["large", "large"]);
});

test("payload budget evicts entries before the entry-count limit", async () => {
    const cache = new CollectionSourceCache<string>(10, 5, (value) => value.length);
    let loads = 0;
    const get = (key: string) =>
        cache.load(key, async () => {
            loads++;
            return "123";
        });
    await get("a");
    await get("b");
    await get("a");
    expect(loads).toBe(3);
});

test("pending work is shared and bounded, failures release capacity and can be retried", async () => {
    const cache = new CollectionSourceCache<string>(2, 10, () => 1, 1);
    let finish!: (value: string) => void;
    const first = cache.load(
        "a",
        () =>
            new Promise((resolve) => {
                finish = resolve;
            }),
    );
    expect(cache.load("a", async () => "unexpected")).toBe(first);
    await expect(cache.load("b", async () => "b")).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    await Promise.resolve();
    finish("a");
    expect(await first).toBe("a");
    await expect(
        cache.load("bad", async () => {
            throw new Error("unavailable");
        }),
    ).rejects.toThrow("unavailable");
    expect(await cache.load("bad", async () => "retry")).toBe("retry");
});

test("cached immutable results cannot be modified through a preparation result", async () => {
    const cache = new CollectionSourceCache<{ nested: { allowed: boolean } }>(2, 100, () => 10);
    const result = await cache.load("a", async () => ({ nested: { allowed: false } }));
    expect(() => {
        result.nested.allowed = true;
    }).toThrow();
    expect((await cache.load("a", async () => ({ nested: { allowed: true } }))).nested.allowed).toBe(false);
});
