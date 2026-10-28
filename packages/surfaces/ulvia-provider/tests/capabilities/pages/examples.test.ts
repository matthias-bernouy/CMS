import { expect, test } from "bun:test";
import {
    createCmsPage,
    updateCmsPage,
    InMemoryContentRepository,
    ValidatingContentRepository,
    createContentReader,
} from "@bernouy/cms-content";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { MemorySiteUpgradeStorage, withSiteWriteFence } from "@bernouy/cms-repository/upgrades";
import { listExamples, getExample } from "../../../src/capabilities/content/pages/examples";

async function fixture() {
    const collections = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await collections.importRelease({
        kind: "collection",
        protocol: "ulvia-collection/v1",
        schemaDialect: "ulvia-schema/v1",
        collectionId: "demo",
        publisherId: "example",
        version: "1.0.0",
        name: "name",
        locale: "en",
        translations: { en: { name: "Demo", description: "Independent document" } },
        assets: [],
        blocs: [
            {
                id: "demo-container",
                kind: "component",
                examples: ["welcome"],
                defaultExample: "welcome",
                label: "name",
                description: "description",
                categories: ["name"],
                root: { accepts: ["main"] },
                markup: "<slot></slot>",
                uses: [],
                requires: [],
                slots: { default: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            },
        ],
        texts: [
            {
                id: "copy",
                label: "name",
                category: "name",
                group: "name",
                values: { en: "Example <safe>", fr: "Bonjour" },
            },
            {
                id: "label",
                label: "name",
                category: "name",
                group: "name",
                values: { en: "Interface", fr: "Interface FR" },
            },
        ],
        examples: [
            {
                id: "welcome",
                label: "name",
                description: "description",
                document: {
                    html: '<main cms-bloc="demo-container"><h1>{{ cms.i18n.demo.copy }}</h1><p>{{ cms.i18n.demo.label }}</p></main>',
                },
                previews: [{ id: "desktop", frame: { width: 800, height: 600 } }],
            },
        ],
    });
    await collections.install("default", artifact.digest, 0);
    const inner = new InMemoryContentRepository();
    const contentWrites = new MemorySiteUpgradeStorage();
    const repo = withSiteWriteFence(
        new ValidatingContentRepository(withInstalledCollections(inner, collections, "default")),
        contentWrites,
        "default",
        ["insertPage", "updatePage"],
    );
    const dependencies = { repo, collections };
    const example = { collectionId: "demo", exampleId: "welcome" };
    return { ...dependencies, dependencies, inner, example, contentWrites };
}

test("examples have a bounded catalogue and install no Pages or routes", async () => {
    const { dependencies, repo, inner } = await fixture();
    expect(await repo.getAllPages()).toEqual([]);
    expect(await createContentReader(repo).getRenderablePages()).toEqual([]);
    expect(await inner.getPageRoute("/welcome")).toBeNull();
    expect(await listExamples(dependencies, { collectionId: "demo", locale: "fr", limit: 1 })).toMatchObject({
        total: 1,
        items: [{ id: "welcome", label: "Demo" }],
    });
    await expect(listExamples(dependencies, { collectionId: "demo", locale: "en", limit: 101 })).rejects.toThrow();
});

test("Pages accept empty or arbitrary valid HTML independently of examples", async () => {
    const { repo } = await fixture();
    expect((await createCmsPage(repo, { path: "/empty", title: "Empty" })).content).toBe("");
    const page = await createCmsPage(repo, {
        path: "/custom",
        title: "Custom",
        content: '<main cms-bloc="demo-container"><p>Authored HTML</p></main>',
    });
    expect(page.content).toContain("Authored HTML");
});

test("an editor can reuse example HTML through ordinary Page writes without provenance", async () => {
    const { dependencies, repo, example } = await fixture();
    const source = await getExample(dependencies, example);
    const first = await createCmsPage(repo, { path: "/first", title: "My title", content: source.document.html });
    const second = await createCmsPage(repo, { path: "/second", title: "Other title", content: source.document.html });
    expect(first.content).toContain("{{ cms.i18n.demo.copy }}");
    expect(source).not.toHaveProperty("locale");
    expect(first.content).toContain("{{ cms.i18n.demo.label }}");
    expect(Object.hasOwn((await repo.getPageById(first.id))!, "origin")).toBe(false);
    await updateCmsPage(repo, {
        id: first.id,
        expectedRevision: first.revision,
        content: '<main cms-bloc="demo-container"><p>Edited</p></main>',
    });
    expect((await repo.getPageById(second.id))?.content).toBe(second.content);
    const document = await getExample(dependencies, example);
    const updated = await updateCmsPage(repo, {
        id: first.id,
        expectedRevision: first.revision + 1,
        content: document.document.html,
    });
    expect(updated).toMatchObject({ id: first.id, path: "/first", title: "My title", visible: false });
    expect(updated.content).toContain("{{ cms.i18n.demo.copy }}");
    await expect(
        updateCmsPage(repo, { id: first.id, expectedRevision: first.revision, content: document.document.html }),
    ).rejects.toThrow();
});

test("example reads reject missing sources; catalogue locale validation and ordinary write fencing remain", async () => {
    const { dependencies, repo, example, contentWrites } = await fixture();
    for (const source of [
        { ...example, collectionId: "missing" },
        { ...example, exampleId: "missing" },
    ]) {
        await expect(getExample(dependencies, source)).rejects.toThrow();
    }
    await expect(listExamples(dependencies, { collectionId: "demo", locale: "not_a_locale" })).rejects.toThrow();
    const source = await getExample(dependencies, example);
    await contentWrites.claimMaintenance("default", "upgrade");
    await expect(
        createCmsPage(repo, { path: "/failed", title: "Failed", content: source.document.html }),
    ).rejects.toThrow();
    expect(await repo.getAllPages()).toEqual([]);
});
