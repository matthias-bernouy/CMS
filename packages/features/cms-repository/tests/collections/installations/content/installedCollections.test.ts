import { expect, test } from "bun:test";
import { renderCollectionTexts, withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { createHash } from "node:crypto";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryCmsRepository, ValidatingCmsRepository } from "@bernouy/cms-content";
import { createContentReader, expandCompositions, generateStyleEntry } from "@bernouy/cms-content/rendering";
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
            "bloc.category.content": "Content",
            "bloc.welcome.label": "Welcome",
            "collection.name": "Test",
            "setting.compact.label": "Compact",
            "setting.group.appearance": "Appearance",
            "setting.group.layout": "Layout",
            "setting.option.accent": "Accent",
            "setting.option.quiet": "Quiet",
            "setting.tone.label": "Tone",
            "text.category.content": "Content",
            "text.group.general": "General",
            "text.label.title": "Title",
            "theme.category.colors.label": "Colors",
            "theme.label": "Test theme",
            "theme.token.accent.label": "Accent",
        },
    },
    assets: [],
    texts: [
        {
            id: "title",
            label: "text.label.title",
            category: "text.category.content",
            group: "text.group.general",
            values: { en: "Welcome" },
        },
    ],
    blocs: [
        {
            kind: "composition",
            id: "test-welcome",
            label: "bloc.welcome.label",
            category: "bloc.category.content",
            order: 30,
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
    expect((await repository.getBlocRecord("test-welcome"))!.contributionId).toBe("test");
    expect((await repository.getBlocRecord("test-welcome"))!.artifact).toMatchObject({
        group: "Content",
        catalogueOrder: 30,
    });
    const reader = createContentReader(repository);
    expect((await reader.getRenderableBlocs())[0]!.compositionHTML).toContain("cms.i18n.test.title");
    expect((await reader.getPublishedPage("/test"))!.content).toContain("test-welcome");
    expect(await reader.getContentRevision!()).toBe(1);
    await store.saveTexts("site", "test", 1, { title: { en: "Changed" } });
    expect(await reader.getContentRevision!()).toBe(2);
    expect((await reader.getContentTexts!())[0]!.resolve("en").title).toBe("Changed");
    await expect(
        repository.replaceBloc({ ...(await repository.getBlocRecord("test-welcome"))!.artifact! }),
    ).rejects.toThrow("immutable");
});

test("installed internal blocs stay out of the authoring catalogue but remain available to rendering", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease({
        ...release,
        translations: {
            en: {
                ...release.translations.en,
                "bloc.helper.label": "Helper",
            },
        },
        blocs: [
            {
                kind: "component",
                id: "test-helper",
                label: "bloc.helper.label",
                internal: true,
                shadowdom: "<div></div>",
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    });
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");

    expect((await repository.getBlocsList()).map(({ id }) => id)).toEqual([]);
    expect((await repository.getBlocsList({ includeInactive: true })).map(({ id }) => id)).toEqual(["test-helper"]);
    expect((await createContentReader(repository).getRenderableBlocs()).map(({ id }) => id)).toEqual(["test-helper"]);
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
    const source = system.theme.sources.find((item) => item.id === "contribution-test")!;
    expect(source.owner).toEqual({ kind: "contribution", contributionId: "test" });
    expect(source.categories[0]!.tokens[0]!.variable).toBe("test-accent");
    const theme = structuredClone(system.theme);
    theme.themes[0]!.values.light["test-accent"] = "#abcdef";
    await repo.updateSystem({ theme });
    const projected = await repo.getSystem();
    expect(projected.theme.themes[0]!.values.light["test-accent"]).toBe("#abcdef");
    const css = new TextDecoder().decode((await generateStyleEntry(createContentReader(repo))).raw);
    expect(css).toContain("--test-accent");
    expect(css).toContain("#abcdef");
});

test("installed shadow component is served as browser bloc JavaScript", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        {
            ...release,
            assets: [{ id: "mark.svg", mediaType: "image/svg+xml", byteLength: bytes.byteLength, digest }],
            blocs: [
                ...release.blocs,
                {
                    kind: "component",
                    id: "test-card",
                    label: "bloc.card.label",
                    shadowdom: '<article class="card"><slot name="body"></slot></article>',
                    style: '.card { color: var(--test-accent); background-image: url("{{ cms.asset.test.mark.svg }}"); }',
                    uses: [],
                    requires: [],
                    slots: { body: {} },
                },
            ],
        },
        [{ id: "mark.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");
    const reader = createContentReader(repository);
    const script = await reader.getBlocViewJS("test-card");
    expect(script).toContain("attachShadow");
    expect(script).toContain("var(--test-accent)");
    expect(script).toContain("cms.asset.test.mark.svg");
    expect(
        (await reader.getRenderableBlocs()).find((bloc) => bloc.id === "test-card")?.compositionHTML,
    ).toBeUndefined();
});

test("installed polymorphic native components project their contract and keep wrapper attributes separate", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease({
        ...release,
        translations: {
            en: {
                ...release.translations.en,
                "setting.title.label": "Wrapper title",
            },
        },
        blocs: [
            ...release.blocs,
            {
                kind: "component",
                id: "test-action",
                label: "bloc.card.label",
                nativeElement: { accepts: ["button", "a"] },
                shadowdom: "<slot></slot>",
                defaultContent: '<button type="button">{{ cms.i18n.test.title }}</button>',
                settings: [
                    {
                        id: "title",
                        label: "setting.title.label",
                        type: "string",
                        default: "",
                        maxLength: 120,
                        control: { kind: "text" },
                    },
                ],
                uses: [],
                requires: [],
                slots: {},
            },
        ],
    });
    await store.install("site", artifact.digest, 0);
    const repository = new ValidatingCmsRepository(
        withInstalledCollections(new InMemoryCmsRepository(), store, "site"),
    );
    const projected = (await repository.getBlocRecord("test-action"))!.artifact!;
    expect(projected.nativeElement).toEqual({ accepts: ["button", "a"] });
    expect((await createContentReader(repository).getRenderableBlocs()).find(({ id }) => id === "test-action")).toEqual(
        expect.objectContaining({ nativeElement: { accepts: ["button", "a"] } }),
    );
    await repository.insertPage(
        "/native-button",
        "Button",
        '<test-action title="Wrapper title"><button type="button">Save</button></test-action>',
    );
    await repository.insertPage(
        "/native-link",
        "Link",
        '<test-action title="Wrapper title"><a href="/about">About</a></test-action>',
    );
    await expect(
        repository.insertPage("/native-wrong", "Wrong", "<test-action><p>Wrong</p></test-action>"),
    ).rejects.toThrow("accepted native child");
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
                defaultContent: '<h2 slot="title">{{ cms.i18n.test.title }}</h2>',
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
                slots: { title: { accepts: [{ kind: "rich-text", profile: "inline" }] } },
            },
        ],
    });
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryCmsRepository(), store, "site");
    const record = (await repository.getBlocRecord("test-card"))!;
    expect(record.artifact?.componentHTML).toContain("cms.i18n.test.title");
    expect(record.artifact?.defaultContent).toContain("cms.i18n.test.title");
    expect(record.artifact?.settings?.map((item) => [item.id, item.default])).toEqual([
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
    ).rejects.toThrow("settings are invalid");
});
