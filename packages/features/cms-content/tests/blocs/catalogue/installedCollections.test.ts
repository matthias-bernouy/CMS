import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository, withInstalledCollections } from "../../../src/exports/index";
import { createContentReader, expandCompositions, renderCollectionTexts } from "../../../src/exports/rendering";
import { parseHTML } from "linkedom";

const release = {
    kind: "collection",
    protocol: "ulvia-collection/v1",
    schemaDialect: "ulvia-schema/v1",
    collectionId: "test",
    publisherId: "example",
    version: "1.0.0",
    name: "collection.name",
    locale: "en",
    translations: {
        en: {
            "bloc.card.label": "Card",
            "bloc.welcome.label": "Welcome",
            "collection.name": "Test",
            "setting.compact.label": "Compact",
            "setting.group.appearance": "Appearance",
            "setting.group.layout": "Layout",
            "setting.option.accent": "Accent",
            "setting.option.quiet": "Quiet",
            "setting.tone.label": "Tone",
            "theme.category.colors.label": "Colors",
            "theme.label": "Test theme",
            "theme.token.accent.label": "Accent",
        },
    },
    assets: [],
    texts: [{ id: "title", values: { en: "Welcome" } }],
    blocs: [
        {
            kind: "composition",
            id: "test-welcome",
            label: "bloc.welcome.label",
            lightdom: "<h1>{{ cms.i18n.test.title }}</h1>",
            uses: [],
            requires: [],
            slots: {},
        },
    ],
};

test("installed resources participate in authoring validation and public read models without writable copies", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(release);
    await store.install("site", artifact.digest, 0);
    const local = new InMemoryCmsRepository();
    const repository = new ValidatingCmsRepository(withInstalledCollections(local, store, "site"));
    await repository.insertPage("/test", "Test", "<test-welcome></test-welcome>");
    const page = (await repository.getPage("/test"))!;
    await repository.updatePage({ id: page.id, visible: true });
    expect(await local.getBlocRecord("test-welcome")).toBeNull();
    expect((await repository.getBlocRecord("test-welcome"))!.collectionId).toBe("test");
    const reader = createContentReader(repository);
    expect((await reader.getRenderableBlocs())[0]!.compositionHTML).toContain("cms.i18n.test.title");
    expect((await reader.getPublishedPage("/test"))!.content).toContain("test-welcome");
    expect(await reader.getCollectionRevision!()).toBe(1);
    await store.saveTexts("site", "test", 1, { title: { en: "Changed" } });
    expect(await reader.getCollectionRevision!()).toBe(2);
    expect((await reader.getCollectionTexts!())[0]!.overrides).toEqual({ title: { en: "Changed" } });
    await expect(
        repository.replaceBloc({ ...(await repository.getBlocRecord("test-welcome"))!.artifact! }),
    ).rejects.toThrow("immutable");
});

test("installed collection theme contributes immutable tokens to editing and public CSS", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease({
        ...release,
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.category.colors.label",
                    tokens: [
                        {
                            id: "accent",
                            label: "theme.token.accent.label",
                            type: "color",
                            defaults: { light: "#116149", dark: "#57cda3" },
                        },
                    ],
                },
            ],
        },
    });
    await store.install("site", artifact.digest, 0);
    const repo = new ValidatingCmsRepository(withInstalledCollections(new InMemoryCmsRepository(), store, "site"));
    const system = await repo.getSystem();
    const source = system.theme.sources.find((item) => item.id === "collection-test")!;
    expect(source.owner).toEqual({ kind: "collection", collectionId: "test" });
    expect(source.categories[0]!.tokens[0]!.variable).toBe("test-accent");
    const theme = structuredClone(system.theme);
    theme.themes[0]!.values.light["test-accent"] = "#abcdef";
    await repo.updateSystem({ theme });
    const projected = await repo.getSystem();
    expect(projected.theme.themes[0]!.values.light["test-accent"]).toBe("#abcdef");
    const { generateStyleEntry } = await import("../../../src/theme/core/generateStyleEntry");
    const css = new TextDecoder().decode((await generateStyleEntry(createContentReader(repo))).raw);
    expect(css).toContain("--test-accent");
    expect(css).toContain("#abcdef");
});

test("installed shadow component is served as browser bloc JavaScript", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease({
        ...release,
        blocs: [
            ...release.blocs,
            {
                kind: "component",
                id: "test-card",
                label: "bloc.card.label",
                shadowdom: '<article class="card"><slot name="body"></slot></article>',
                style: ".card { color: var(--test-accent); }",
                uses: [],
                requires: [],
                slots: { body: {} },
            },
        ],
    });
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");
    const reader = createContentReader(repository);
    const script = await reader.getBlocViewJS("test-card");
    expect(script).toContain("attachShadow");
    expect(script).toContain("var(--test-accent)");
    expect(
        (await reader.getRenderableBlocs()).find((bloc) => bloc.id === "test-card")?.compositionHTML,
    ).toBeUndefined();
});

test("installed collection thumbnails are projected from verified release assets", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>');
    const artifact = await store.importRelease(
        {
            ...release,
            assets: [
                {
                    id: "card.svg",
                    mediaType: "image/svg+xml",
                    byteLength: bytes.byteLength,
                    digest: `sha256:${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}`,
                },
            ],
            blocs: [
                {
                    kind: "component",
                    id: "test-card",
                    label: "bloc.card.label",
                    thumbnail: "card.svg",
                    shadowdom: "<article></article>",
                    uses: [],
                    requires: [],
                    slots: {},
                },
            ],
        },
        [{ id: "card.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");

    const projected = (await repository.getBlocRecord("test-card"))!.artifact!;
    expect(projected.thumbnail).toEqual({ path: "assets/card.svg" });
    expect(Buffer.from(projected.source!["assets/card.svg"]!, "base64")).toEqual(Buffer.from(bytes));
});

test("installed hybrid component keeps its fixed Light DOM and page defaults distinct", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease({
        ...release,
        blocs: [
            {
                kind: "component",
                id: "test-card",
                label: "bloc.card.label",
                shadowdom: '<article><slot name="body"></slot></article>',
                lightdom:
                    '<slot name="title" slot="body"></slot><section slot="body"><p>{{ cms.i18n.test.title }}</p></section>',
                defaultContent: '<h2 slot="title">Page title</h2>',
                settings: [
                    {
                        id: "tone",
                        label: "setting.tone.label",
                        group: "setting.group.appearance",
                        type: "string",
                        control: {
                            kind: "select",
                            options: [
                                { value: "quiet", label: "setting.option.quiet" },
                                { value: "accent", label: "setting.option.accent" },
                            ],
                        },
                        maxLength: 16,
                        default: "quiet",
                    },
                    {
                        id: "compact",
                        label: "setting.compact.label",
                        group: "setting.group.layout",
                        type: "boolean",
                        default: false,
                    },
                ],
                uses: [],
                requires: [],
                slots: { title: {} },
            },
        ],
    });
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");
    const record = (await repository.getBlocRecord("test-card"))!;
    expect(record.artifact?.componentHTML).toContain("cms.i18n.test.title");
    expect(record.artifact?.defaultContent).toContain("Page title");
    expect(record.artifact?.collectionSettings?.map((item) => [item.id, item.default])).toEqual([
        ["tone", "quiet"],
        ["compact", false],
    ]);
    expect((await createContentReader(repository).getRenderableBlocs())[0]?.componentHTML).toContain(
        "cms.i18n.test.title",
    );
    const { document } = parseHTML('<html><body><test-card><h2 slot="title">My page</h2></test-card></body></html>');
    expandCompositions(document.body, await createContentReader(repository).getRenderableBlocs());
    renderCollectionTexts(document.body, "en", [{ collection: artifact.release }]);
    expect(document.querySelector("test-card")?.textContent).toBe("My pageWelcome");
    const validated = new ValidatingCmsRepository(repository);
    await validated.insertPage("/valid-card", "Valid", '<test-card tone="accent" compact></test-card>');
    await expect(
        validated.insertPage("/invalid-card", "Invalid", '<test-card tone="unknown"></test-card>'),
    ).rejects.toThrow("invalid test-card settings");
});
