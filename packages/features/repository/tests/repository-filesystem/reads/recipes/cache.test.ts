import { expect, spyOn, test } from "bun:test";
import { RecipeCatalogue } from "repository/repository/filesystem/artifacts/discovery/recipes";
import { RecipeProjections } from "repository/repository/filesystem/artifacts/discovery/projections";
import { recipeFixture } from "./fixture";

test("concurrent readers share one bounded load and aborting one reader does not cancel the others", async () => {
    const f = await recipeFixture();
    await f.add();
    const references = await f.index.latestCollectionReferences("stable");
    const gate = Promise.withResolvers<typeof references>();
    const entered = Promise.withResolvers<void>();
    let loads = 0;
    const catalogue = new RecipeCatalogue(f.root, () => {
        loads++;
        entered.resolve();
        return gate.promise;
    });
    const controller = new AbortController();
    const aborted = catalogue.page({ limit: 1 }, controller.signal);
    const remaining = Array.from({ length: 16 }, () => catalogue.page({ limit: 1 }));
    await entered.promise;
    controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    expect(loads).toBe(1);
    gate.resolve(references);
    expect((await Promise.all(remaining)).every(({ items }) => items.length === 1)).toBe(true);
    await catalogue.page({ limit: 1 });
    expect(loads).toBe(1);
});

test("invalidation during a shared load cannot publish the old snapshot", async () => {
    const f = await recipeFixture();
    await f.add();
    const oldReferences = await f.index.latestCollectionReferences("stable");
    const gate = Promise.withResolvers<typeof oldReferences>();
    let loads = 0;
    const catalogue = new RecipeCatalogue(f.root, () =>
        ++loads === 1 ? gate.promise : f.index.latestCollectionReferences("stable"),
    );
    const pending = catalogue.page({ limit: 1 });
    const latest = await f.add("1.1.0");
    catalogue.invalidate();
    gate.resolve(oldReferences);
    expect((await pending).items[0]!.root.digest).toBe(latest.digest);
    expect((await catalogue.page({ limit: 1 })).items[0]!.root.digest).toBe(latest.digest);
    expect(loads).toBe(2);
});

test("entry and byte bounds refuse before retaining a partial snapshot; failures permit a fresh load", async () => {
    const f = await recipeFixture();
    await f.add();
    const references = await f.index.latestCollectionReferences("stable");
    const read = spyOn(RecipeProjections.prototype, "get");
    try {
        const tooMany = new RecipeCatalogue(f.root, async () => Array.from({ length: 10_001 }, () => references[0]!));
        await expect(tooMany.page({ limit: 1 })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
        expect(read).not.toHaveBeenCalled();
        let loads = 0;
        const tooLarge = new RecipeCatalogue(
            f.root,
            async () => {
                loads++;
                return references;
            },
            1,
        );
        for (let attempt = 0; attempt < 2; attempt++) {
            await expect(tooLarge.page({ limit: 1 })).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
        }
        expect(loads).toBe(2);
        expect(read).toHaveBeenCalledTimes(2);
    } finally {
        read.mockRestore();
    }
});

test("invalid pagination, invalid locales and already-aborted readers do not start index loads", async () => {
    const f = await recipeFixture();
    let loads = 0;
    const catalogue = new RecipeCatalogue(f.root, async () => {
        loads++;
        return [];
    });
    for (const input of [
        { limit: 0 },
        { limit: 65 },
        { limit: 1, cursor: "forged" },
        { limit: 1, locale: "bad_locale" },
    ]) {
        await expect(catalogue.page(input)).rejects.toMatchObject({ code: "REJECTED" });
    }
    await expect(catalogue.page({ limit: 1 }, AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    expect(loads).toBe(0);
});
