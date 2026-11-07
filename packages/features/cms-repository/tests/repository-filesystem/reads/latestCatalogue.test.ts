import { expect, test } from "bun:test";
import { cataloguePage, CatalogueInputError } from "../../../src/repository/filesystem/core/catalogue";

test("latest discovery selects the channel before grouping and paginates collection identities", async () => {
    const entries = [
        { publisherId: "test", collectionId: "test/a", version: "1.0.0" },
        { publisherId: "test", collectionId: "test/a", version: "2.0.0" },
        { publisherId: "test", collectionId: "test/a", version: "3.0.0-beta.1" },
        { publisherId: "test", collectionId: "test/b", version: "1.0.0" },
    ];
    let reads = 0;
    const index = {
        list: async () => {
            reads++;
            return entries;
        },
    };
    const filters = { latestPerResource: true, channel: "stable" as const };
    const first = await cataloguePage("collections", index, "1", null, false, filters);
    expect(first.releases).toEqual([entries[1]!]);
    expect(reads).toBe(1);
    // Updating an already emitted collection cannot repeat it on the next page.
    entries.splice(2, 0, { ...entries[1]!, version: "2.1.0" });
    const second = await cataloguePage("collections", index, "1", first.nextCursor!, false, filters);
    expect(second.releases).toEqual([entries.at(-1)!]);
    expect(second.nextCursor).toBeUndefined();
    expect(
        (
            await cataloguePage("collections", index, "2", null, false, { latestPerResource: true, channel: "beta" })
        ).releases.map(({ version }) => version),
    ).toEqual(["3.0.0-beta.1"]);
    await expect(
        cataloguePage("collections", index, "1", first.nextCursor!, false, { channel: "stable" }),
    ).rejects.toBeInstanceOf(CatalogueInputError);
    await expect(
        cataloguePage("collections", index, "1", first.nextCursor!, false, { latestPerResource: true, channel: "all" }),
    ).rejects.toBeInstanceOf(CatalogueInputError);
});

test("historical catalogue keeps exact version filtering and does not collapse releases", async () => {
    const entries = ["1.0.0", "1.1.0", "2.0.0"].map((version) => ({
        publisherId: "test",
        collectionId: "test/a",
        version,
    }));
    const index = { list: async () => entries };
    expect((await cataloguePage("collections", index, "3", null, false, { id: "test/a" })).releases).toHaveLength(3);
    expect(
        (await cataloguePage("collections", index, "1", null, false, { id: "test/a", version: "1.1.0" })).releases,
    ).toEqual([entries[1]!]);
});

test("warm latest pages reuse immutable index views and changed snapshots invalidate them", async () => {
    let scanned = 0;
    const values = Object.freeze(
        Array.from({ length: 10000 }, (_, i) => ({
            publisherId: "test",
            collectionId: `test/item-${String(Math.floor(i / 100)).padStart(3, "0")}`,
            version: `1.0.${i % 100}`,
        })),
    );
    const entries = new Proxy(values, {
        get(target, property, receiver) {
            if (property === Symbol.iterator) {
                return function* () {
                    for (const item of target) {
                        scanned++;
                        yield item;
                    }
                };
            }
            return Reflect.get(target, property, receiver);
        },
    });
    let current = entries;
    const index = { list: async () => current };
    const filters = { latestPerResource: true, channel: "stable" as const };
    const first = await cataloguePage("collections", index, "10", null, false, filters);
    expect(first.releases).toHaveLength(10);
    expect(scanned).toBe(10000);
    await cataloguePage("collections", index, "10", first.nextCursor!, false, filters);
    expect(scanned).toBe(10000);
    current = Object.freeze([
        ...values,
        { publisherId: "test", collectionId: "test/zzz", version: "1.0.0" },
    ]) as typeof entries;
    const after = await cataloguePage("collections", index, "256", null, false, filters);
    expect(after.releases).toHaveLength(101);
    expect(
        (await cataloguePage("collections", index, "256", null, false, { latestPerResource: true, channel: "beta" }))
            .releases,
    ).toHaveLength(0);
});
