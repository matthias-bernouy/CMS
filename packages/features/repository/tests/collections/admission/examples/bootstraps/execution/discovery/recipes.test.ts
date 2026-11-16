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
    f.entries.pop();
    await expect(f.service.list(first.cursor)).rejects.toMatchObject({ status: 409 });
    expect(f.observed.verifications).toBe(verifications);
    expect(await f.businessState()).toEqual(before);
});

test("discovery refuses release bytes that do not match the exact catalogue digest without changing the site", async () => {
    const f = await discoveryFixture();
    const before = await f.businessState();
    const [path, json] = [...f.releases][0];
    f.releases.set(path, JSON.stringify({ ...JSON.parse(json), version: "1.0.1" }));
    await expect(f.service.list()).rejects.toThrow("digest mismatch");
    expect(await f.businessState()).toEqual(before);
    f.releases.set(path, json);
    expect((await f.service.list()).items).toHaveLength(1);
});
