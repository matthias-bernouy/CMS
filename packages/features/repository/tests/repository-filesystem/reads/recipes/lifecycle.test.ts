import { expect, spyOn, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RecipeProjections } from "repository/repository/filesystem/artifacts/discovery/projections";
import { recipeFixture } from "./fixture";

test("cold recipe discovery reads only projections and warm discovery reuses them without release validation", async () => {
    const f = await recipeFixture();
    await f.add();
    await f.add("1.0.0", true, "other");
    const read = spyOn(RecipeProjections.prototype, "get");
    try {
        const first = await f.reads.recipes({ limit: 1, locale: "fr-CA" });
        expect(first.items[0]!.label).toBe("Administration française");
        expect(read).toHaveBeenCalledTimes(2);
        const second = await f.reads.recipes({ limit: 1, locale: "fr-ca", cursor: first.cursor });
        expect(second.items[0]!.root.collectionId).toBe("atlas.official/other");
        expect(second.cursor).toBe("");
        await f.reads.recipes({ limit: 1 });
        expect(read).toHaveBeenCalledTimes(2);
        expect(f.counts.verifications).toBe(0);
        await expect(f.reads.recipes({ limit: 1, locale: "en", cursor: first.cursor })).rejects.toMatchObject({
            code: "REJECTED",
        });
    } finally {
        read.mockRestore();
    }
});

test("publication, stable selection and reversible yanks invalidate recipes without reviving a removed recipe", async () => {
    const f = await recipeFixture();
    const old = await f.add();
    await f.add("1.0.0", true, "other");
    const first = await f.reads.recipes({ limit: 1 });
    await f.add("1.1.0", false);
    await f.add("2.0.0-beta.1");
    expect((await f.reads.recipes({ limit: 4 })).items.map(({ root }) => root.collectionId)).toEqual([
        "atlas.official/other",
    ]);
    await expect(f.reads.recipes({ limit: 1, cursor: first.cursor })).rejects.toMatchObject({ code: "REJECTED" });
    const coordinate = {
        kind: "collection" as const,
        publisherId: "atlas.official",
        id: "atlas.official/atlas",
        version: "1.1.0",
    };
    await f.registry.setYank(coordinate, "Withdrawn");
    expect((await f.reads.recipes({ limit: 4 })).items[0]!.root.digest).toBe(old.digest);
    await f.registry.setYank(coordinate, null);
    expect((await f.reads.recipes({ limit: 4 })).items).toHaveLength(1);
});

test("missing projections refuse discovery without repair and explicit preparation validates only latest metadata", async () => {
    const f = await recipeFixture();
    const artifact = await f.add();
    await rm(f.projectionPath());
    await mkdir(join(f.root, "releases/atlas.official/atlas"), { recursive: true });
    await writeFile(
        join(f.root, "releases/atlas.official/atlas/0.9.0.json"),
        "historical document must not be hydrated",
    );
    await expect(f.reads.recipes({ limit: 4 })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    expect(await Bun.file(f.projectionPath()).exists()).toBe(false);
    expect(f.counts.verifications).toBe(0);
    await f.index.prepareRecipes();
    expect(f.counts.verifications).toBe(1);
    expect((await f.reads.recipes({ limit: 4 })).items[0]!.root.digest).toBe(artifact.digest);
    expect(f.counts.verifications).toBe(1);
});

test("corrupt or foreign projections refuse without repair and failed loads are never cached", async () => {
    const f = await recipeFixture();
    await f.add();
    const bytes = await readFile(f.projectionPath(), "utf8");
    for (const patch of ["not json", JSON.stringify({ ...JSON.parse(bytes), collectionId: "other/atlas" })]) {
        await writeFile(f.projectionPath(), patch);
        await expect(f.reads.recipes({ limit: 4 })).rejects.toThrow();
        expect(await readFile(f.projectionPath(), "utf8")).toBe(patch);
    }
    await writeFile(f.projectionPath(), bytes);
    expect((await f.reads.recipes({ limit: 4 })).items).toHaveLength(1);
});

test("a projection write failure cannot make an admitted release visible", async () => {
    const f = await recipeFixture();
    const artifact = await f.artifact();
    await mkdir(dirname(f.projectionPath()), { recursive: true });
    await writeFile(f.projectionPath(), "conflicting projection");
    await expect(f.store.store(artifact)).rejects.toThrow("differs from admitted metadata");
    const releasePath = join(f.root, "releases/atlas.official/atlas/1.0.0.json");
    expect(await Bun.file(releasePath).exists()).toBe(false);
    await rm(f.projectionPath());
    expect(await f.store.store(artifact)).toBe(true);
    expect((await f.reads.recipes({ limit: 4 })).items[0]!.root.digest).toBe(artifact.digest);
});

test("yank prepares a missing historical fallback before mutation and preparation failures leave yank state unchanged", async () => {
    const f = await recipeFixture();
    const old = await f.add();
    await f.add("1.1.0");
    await rm(f.projectionPath());
    const coordinate = {
        kind: "collection" as const,
        publisherId: "atlas.official",
        id: "atlas.official/atlas",
        version: "1.1.0",
    };
    await f.registry.setYank(coordinate, "Withdrawn");
    expect((await f.reads.recipes({ limit: 4 })).items[0]!.root.digest).toBe(old.digest);
    await f.registry.setYank(coordinate, null);
    const before = await f.registry.getPublicationState(coordinate);
    await writeFile(f.projectionPath(), "corrupt fallback");
    await expect(f.registry.setYank(coordinate, "Withdrawn")).rejects.toThrow();
    expect(await f.registry.getPublicationState(coordinate)).toEqual(before);
});
