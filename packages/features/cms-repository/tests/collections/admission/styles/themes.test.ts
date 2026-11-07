import { expect, spyOn, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { createContentReader, generateStyleEntry } from "@bernouy/cms-content/rendering";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { withInstalledCollections } from "cms-repository/collections/integration/content/installedRepository";
import { CollectionStore } from "cms-repository/collections/installations/core/CollectionStore";
import { MemoryCollectionStorage } from "cms-repository/collections/installations/default-implementation/memory/MemoryCollectionStorage";
import { colorCollection } from "./fixture";

const style = ":scope { color: var(--atlas-dofficial--atlas--accent); }";

test("accepts explicitly imported tokens without requiring the official collection", () => {
    const source = colorCollection(":scope { background: var(--example--brand--surface); }");
    source.dependencies = [
        {
            collectionId: "example/brand",
            publisherId: "example",
            versionRange: "^1.0.0",
            imports: { themeTokens: [{ id: "surface" }] },
        },
    ];
    expect(() => parseCollectionRelease(source)).not.toThrow();
    source.dependencies = [];
    expect(() => parseCollectionRelease(source)).toThrow(/cannot read CSS variable/);
});

test("the same installed Bloc uses each site's light/dark overrides without changing its CSS", async () => {
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    const artifact = await store.importRelease(colorCollection(style));
    const repositories = [];
    for (const [siteId, light, dark] of [
        ["a", "#eeaa11", "#442211"],
        ["b", "#1188ee", "#112244"],
    ]) {
        await store.install(siteId!, artifact.digest, 0);
        const repository = new ValidatingContentRepository(
            withInstalledCollections(new InMemoryContentRepository(), store, siteId!),
        );
        const theme = (await repository.getSystem()).theme;
        theme.themes[0]!.values.light["atlas-dofficial--atlas--accent"] = light!;
        theme.themes[0]!.values.dark["atlas-dofficial--atlas--accent"] = dark!;
        await repository.updateSystem({ theme });
        const css = new TextDecoder().decode((await generateStyleEntry(createContentReader(repository))).raw);
        expect(css).toContain(light!);
        expect(css).toContain(dark!);
        repositories.push(repository);
    }
    const first = (await repositories[0]!.getBlocRecord("atlas-dofficial--atlas--panel"))!.artifact!.styleCSS;
    expect(first).toContain("var(--atlas-dofficial--atlas--accent)");
    expect((await repositories[1]!.getBlocRecord("atlas-dofficial--atlas--panel"))!.artifact!.styleCSS).toBe(first);
    expect((await repositories[0]!.getSystem()).theme.themes[0]!.values.light["atlas-dofficial--atlas--accent"]).toBe(
        "#eeaa11",
    );
    expect((await repositories[1]!.getSystem()).theme.themes[0]!.values.light["atlas-dofficial--atlas--accent"]).toBe(
        "#1188ee",
    );
});

test("invalid colors cannot mutate release storage or either site's installations", async () => {
    const storage = new MemoryCollectionStorage();
    const store = new CollectionStore(storage);
    const artifact = await store.importRelease(colorCollection(style));
    await store.install("a", artifact.digest, 0);
    await store.install("b", artifact.digest, 0);
    const before = await Promise.all([storage.readSite("a"), storage.readSite("b")]);
    const writeRelease = spyOn(storage, "putRelease");
    const writeSite = spyOn(storage, "compareAndSet");
    await expect(store.importRelease(colorCollection(":scope { background: #fff; }"))).rejects.toThrow(/theme token/);
    expect(writeRelease).not.toHaveBeenCalled();
    expect(writeSite).not.toHaveBeenCalled();
    expect(await Promise.all([storage.readSite("a"), storage.readSite("b")])).toEqual(before);
});
