import { expect, test } from "bun:test";
import { discoveryFixture } from "./fixture";

test("recipe discovery pages exact latest stable releases, localizes labels and never downloads assets", async () => {
    const f = await discoveryFixture([
        { name: "alpha", versions: ["1.0.0", "1.2.0", "2.0.0-beta.1", "1.1.0"] },
        { name: "bravo" },
        { name: "charlie" },
        { name: "delta" },
        { name: "echo" },
    ]);
    const before = await f.businessState();
    const first = await f.service.list(undefined, "fr-CA");
    expect(first.items).toHaveLength(4);
    expect(first.items[0]).toMatchObject({
        root: {
            publisherId: "atlas.official",
            collectionId: "atlas.official/alpha",
            version: "1.2.0",
            digest: f.entries[1].digest,
            bootstrapId: "admin",
        },
        label: "Administration française",
        pageCount: 1,
        includeCount: 0,
    });
    const second = await f.service.list(first.cursor, "fr-CA");
    expect(second.items.map(({ root }) => root.collectionId)).toEqual(["atlas.official/echo"]);
    expect(second.cursor).toBe("");
    expect(f.requests.some(({ path }) => path.includes("/assets/"))).toBe(false);
    expect(await f.businessState()).toEqual(before);
});

test("a changed catalogue refuses an old recipe cursor before reading any release", async () => {
    const f = await discoveryFixture(["alpha", "bravo", "charlie", "delta", "echo"].map((name) => ({ name })));
    const first = await f.service.list();
    const before = await f.businessState();
    const verifications = f.observed.verifications;
    await f.yank("atlas.official/echo", "1.0.0");
    await expect(f.service.list(first.cursor)).rejects.toMatchObject({ status: 409 });
    expect(f.observed.verifications).toBe(verifications);
    expect(await f.businessState()).toEqual(before);
});

test("discovery refuses forged summary references without downloading collection releases", async () => {
    const f = await discoveryFixture();
    const before = await f.businessState();
    const result = await f.service.list();
    f.observed.intercept = async () =>
        Response.json({
            ...result,
            items: result.items.map((item) => ({ ...item, root: { ...item.root, publisherId: "other" } })),
        });
    await expect(f.service.list()).rejects.toThrow("Invalid recipe catalogue references");
    expect(await f.businessState()).toEqual(before);
    f.observed.intercept = undefined;
    expect((await f.service.list()).items).toHaveLength(1);
    expect(f.observed.releaseBytes).toBe(0);
});

test("collections without recipes do not consume recipe page slots", async () => {
    const f = await discoveryFixture([
        ...["alpha", "bravo", "charlie", "delta"].map((name) => ({ name, recipes: false })),
        { name: "echo" },
    ]);
    const result = await f.service.list();
    expect(result.items.map(({ root }) => root.collectionId)).toEqual(["atlas.official/echo"]);
    expect(result.cursor).toBe("");
});
