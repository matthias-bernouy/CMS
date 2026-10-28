import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../../src/exports/collections/installations";
import { withInstalledCollections } from "../../../../src/exports/collections/integration/content";
import { InMemoryContentRepository, getCmsEditorCatalogue } from "@bernouy/cms-content";
import { exampleCollection } from "./fixture";

test("installed examples expose one catalogue item with multiple categories and independent insertion content", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(exampleCollection());
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");
    const catalogue = await getCmsEditorCatalogue(repository);
    const panel = catalogue.items.find((item) => item.id === "atlas-panel")!;
    const authoring = JSON.parse(panel.authoringJson);
    expect(catalogue.items.filter((item) => item.id === "atlas-panel")).toHaveLength(1);
    expect(authoring.categories).toEqual(["Layout", "Content"]);
    expect(authoring.initialDocument.html).toContain('tone="accent"');
    expect(authoring.initialDocument.html).toContain("{{ cms.i18n.atlas.greeting }}");
    expect((await store.snapshot("site")).collections[0]!.textOverrides).toEqual({});
    expect(await repository.getAllPages()).toHaveLength(0);
});

test("localized category aliases do not prevent a valid collection from loading", async () => {
    const source = exampleCollection();
    source.translations["en-US"]["category.content"] = "Layout";
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(source);
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");
    const catalogue = await getCmsEditorCatalogue(repository);
    expect(JSON.parse(catalogue.items[0]!.authoringJson).categories).toEqual(["Layout"]);
});
