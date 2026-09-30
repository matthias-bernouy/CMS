import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";
import { collectionDocument } from "../fixtures";

function release() {
    return {
        ...collectionDocument(),
        assets: [],
        blocs: [
            {
                kind: "composition",
                id: "atlas-welcome",
                lightdom: "<p>Hello</p>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
        texts: [{ id: "title", values: { en: "Hello", fr: "Bonjour" } }],
        locale: "en",
    };
}

test("release identity is immutable and installation keeps a digest pin", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const input = release();
    const artifact = await store.importRelease(input);
    await store.install("a", artifact.digest, 0);
    input.texts[0]!.values.en = "Changed";
    await expect(store.importRelease(input)).rejects.toThrow("Immutable");
    const state = await store.snapshot("a");
    expect(state.collections[0]!.digest).toBe(artifact.digest);
    expect(state.collections[0]!.release.texts![0]!.values.en).toBe("Hello");
    expect((await store.snapshot("b")).collections).toEqual([]);
});

test("concurrent saves conflict, isolate site overrides and preserve release defaults", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(release());
    await store.install("a", artifact.digest, 0);
    await store.install("b", artifact.digest, 0);
    const results = await Promise.allSettled([
        store.saveTexts("a", "atlas", 1, { title: { fr: "Salut" } }),
        store.saveTexts("a", "atlas", 1, { title: { fr: "Bonsoir" } }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await store.snapshot("a")).revision).toBe(2);
    expect((await store.snapshot("b")).collections[0]!.textOverrides).toEqual({});
    expect((await store.snapshot("a")).collections[0]!.release.texts![0]!.values.fr).toBe("Bonjour");
    await expect(store.saveTexts("a", "atlas", 2, { missing: { fr: "No" } })).rejects.toThrow();
    await store.saveTexts("a", "atlas", 2, {});
    expect((await store.snapshot("a")).collections[0]!.textOverrides).toEqual({});
});

test("compatible repository upgrade preserves site texts and rejects removals", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const old = await store.importRelease(release());
    await store.install("site", old.digest, 0, "local");
    await store.saveTexts("site", "atlas", 1, { title: { fr: "Salut" } });
    const newer = await store.importRelease({
        ...release(),
        version: "1.1.0",
        texts: [
            { id: "title", values: { en: "New", fr: "Nouveau" } },
            { id: "other", values: { en: "Other" } },
        ],
    });
    await store.upgrade("site", newer.digest, 2, "local");
    const current = (await store.snapshot("site")).collections[0]!;
    expect(current.digest).toBe(newer.digest);
    expect(current.textOverrides.title?.fr).toBe("Salut");
    expect(current.repositoryId).toBe("local");
    await expect(store.upgrade("site", old.digest, 3, "local")).rejects.toThrow("newer");
    const removing = await store.importRelease({ ...release(), version: "1.2.0", texts: [] });
    await expect(store.upgrade("site", removing.digest, 3, "local")).rejects.toThrow("removes");
});
