import { collectionFixture } from "../../admission/examples/buildFixture";
import { expect, test } from "bun:test";
import { renderCollectionTexts, withInstalledCollections } from "@bernouy/cms-repository/collections/content";
import { createHash } from "node:crypto";
import { CollectionStore, MemoryCollectionStorage } from "@bernouy/cms-repository/collections/installations";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { createContentReader, expandCompositions, generateStyleEntry } from "@bernouy/cms-content/rendering";
import { parseHTML } from "linkedom";
import { compileBlocStyle } from "@bernouy/cms-repository/collections/build";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";

const release = collectionFixture({
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
            "bloc.heading.label": "Heading",
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
            description: "bloc.heading.label",

            kind: "component",
            root: { accepts: ["h1", "h2", "h3", "h4", "h5", "h6"] },
            id: "test-heading",
            label: "bloc.heading.label",
            categories: ["bloc.category.content"],
            order: 20,
            markup: "<slot></slot>",
            uses: [],
            requires: [],
            slots: {
                default: {
                    accepts: [{ kind: "native-content", profile: "phrasing" }],
                    min: 1,
                },
            },
        },
        {
            description: "bloc.welcome.label",

            kind: "composition",
            root: { accepts: ["div"] },
            id: "test-welcome",
            label: "bloc.welcome.label",
            categories: ["bloc.category.content"],
            order: 30,
            markup: '<h1 cms-bloc="test-heading">{{ cms.i18n.test.title }}</h1>',
            uses: ["test-heading"],
            requires: [],
            slots: {},
        },
    ],
});

test("installed resources participate in authoring validation and public read models without writable copies", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(collectionFixture(release));
    await store.install("site", artifact.digest, 0);
    const local = new InMemoryContentRepository();
    const repository = new ValidatingContentRepository(withInstalledCollections(local, store, "site"));
    await repository.insertPage("/test", "Test", '<div cms-bloc="test-welcome"></div>');
    const page = (await repository.getPage("/test"))!;
    await repository.updatePage({ id: page.id, visible: true });
    expect(await local.getBlocRecord("test-welcome")).toBeNull();
    expect((await repository.getBlocRecord("test-welcome"))!.contributionId).toBe("test");
    expect((await repository.getBlocRecord("test-welcome"))!.artifact).toMatchObject({
        group: "Content",
        catalogueOrder: 30,
    });
    const reader = createContentReader(repository);
    expect((await reader.getRenderableBlocs()).find((bloc) => bloc.id === "test-welcome")?.markupHTML).toContain(
        "cms.i18n.test.title",
    );
    expect((await reader.getPublishedPage("/test"))!.content).toContain("test-welcome");
    expect(await reader.getContentRevision!()).toBe(1);
    await store.saveTexts("site", "test", 1, { title: { en: "Changed" } });
    expect(await reader.getContentRevision!()).toBe(2);
    expect((await reader.getContentTexts!())[0]!.resolve("en").title).toBe("Changed");
    await expect(
        repository.replaceBloc({ ...(await repository.getBlocRecord("test-welcome"))!.artifact! }),
    ).rejects.toThrow("immutable");
});

test("site Pages inherit capability requirements from installed Blocs", async () => {
    const contracts = new InMemoryReleaseCatalogue();
    await contracts.publish(
        await admitContractRelease({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "example.files",
            name: "Example files",
            version: "1.0.0",
            publisherId: "example",
            capabilities: [
                {
                    id: "files.read",
                    access: "public",
                    behavior: { effect: "query", execution: "sync" },
                    input: {
                        type: "object",
                        properties: {
                            fileId: { type: "string", maxLength: 128 },
                            generation: { type: "string", maxLength: 128 },
                        },
                        required: ["fileId", "generation"],
                    },
                    output: { type: "binary", maxBytes: 1024 },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "GET",
                            path: "/files/{fileId}/{generation}",
                            input: { path: { fileId: "fileId", generation: "generation" } },
                            response: {
                                successStatuses: [200],
                                contentTypes: [],
                                errorStatuses: {},
                            },
                        },
                    ],
                },
            ],
        }),
    );
    const store = new CollectionStore(new MemoryCollectionStorage(), contracts);
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            blocs: release.blocs.map((bloc) =>
                bloc.id === "test-welcome"
                    ? {
                          ...bloc,
                          requires: [
                              {
                                  contractId: "example.files",
                                  capabilityId: "files.read",
                                  versionRange: "^1.0.0",
                              },
                          ],
                      }
                    : bloc,
            ),
        }),
    );
    await store.install("site", artifact.digest, 0);
    const repository = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), store, "site"),
    );
    await repository.insertPage("/media", "Media", '<div cms-bloc="test-welcome"></div>');
    const page = (await repository.getPage("/media"))!;
    await repository.updatePage({ id: page.id, visible: true });

    expect((await createContentReader(repository).getRenderablePage("/media"))?.requirements).toEqual([
        {
            contractId: "example.files",
            capabilityId: "files.read",
            versionRange: "^1.0.0",
        },
    ]);
});

test("installed hidden blocs stay out of the authoring catalogue but remain available to rendering", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            translations: {
                en: {
                    ...release.translations.en,
                    "bloc.helper.label": "Helper",
                },
            },
            blocs: [
                {
                    description: "bloc.helper.label",
                    categories: ["bloc.helper.label"],
                    kind: "component",
                    root: { accepts: ["div"] },
                    id: "test-helper",
                    label: "bloc.helper.label",
                    catalogue: "hidden",
                    markup: "<div></div>",
                    uses: [],
                    requires: [],
                    slots: {},
                },
            ],
        }),
    );
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");

    expect((await repository.getBlocsList()).map(({ id }) => id)).toEqual([]);
    expect((await repository.getBlocsList({ includeHidden: true })).map(({ id }) => id)).toEqual(["test-helper"]);
    expect((await createContentReader(repository).getRenderableBlocs()).map(({ id }) => id)).toEqual(["test-helper"]);
});

test("installed collection theme contributes immutable tokens to editing and public CSS", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            theme: {
                label: "theme.label",
                categories: [
                    {
                        id: "colors",
                        label: "theme.category.colors.label",
                        entries: [
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
        }),
    );
    await store.install("site", artifact.digest, 0);
    const repo = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), store, "site"),
    );
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

test("installed Light DOM component projects its repository-compiled style without JavaScript", async () => {
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;
    const store = new CollectionStore(new MemoryCollectionStorage());
    const style = ":scope { color: var(--test-card-accent, #123456); }";
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            assets: [{ id: "mark.svg", mediaType: "image/svg+xml", byteLength: bytes.byteLength, digest }],
            blocs: [
                ...release.blocs,
                {
                    description: "bloc.card.label",
                    categories: ["bloc.card.label"],

                    kind: "component",
                    root: { accepts: ["div"] },
                    id: "test-card",
                    label: "bloc.card.label",
                    markup: '<article class="card"><slot name="body"></slot></article>',
                    style,
                    uses: [],
                    requires: [],
                    slots: { body: {} },
                },
            ],
        }),
        [{ id: "mark.svg", bytes }],
    );
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");
    const reader = createContentReader(repository);
    expect(await reader.getBlocViewJS("test-card")).toBeNull();
    const projected = (await reader.getRenderableBlocs()).find((bloc) => bloc.id === "test-card");
    expect(projected).toMatchObject({
        hasBehavior: false,
        styleCollectionId: "test",
        styleCSS: compileBlocStyle("test-card", style),
    });
    expect(projected?.markupHTML).toBe('<article class="card"><slot name="body"></slot></article>');
});

test("installed polymorphic native components project their contract and keep wrapper attributes separate", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            translations: {
                en: {
                    ...release.translations.en,
                    "setting.wrapper-label.label": "Wrapper label",
                },
            },
            blocs: [
                ...release.blocs,
                {
                    description: "bloc.card.label",
                    categories: ["bloc.card.label"],

                    kind: "component",
                    id: "test-action",
                    label: "bloc.card.label",
                    root: { accepts: ["div"] },
                    markup: "<slot></slot>",
                    exampleContent: '<button type="button">{{ cms.i18n.test.title }}</button>',
                    settings: [
                        {
                            id: "wrapper-label",
                            label: "setting.wrapper-label.label",
                            type: "string",
                            default: "",
                            maxLength: 120,
                            control: { kind: "text" },
                        },
                    ],
                    uses: [],
                    requires: [],
                    slots: {
                        default: {
                            accepts: [{ kind: "native-element", accepts: ["button", "a"] }],
                            min: 1,
                            max: 1,
                        },
                    },
                },
            ],
        }),
    );
    await store.install("site", artifact.digest, 0);
    const repository = new ValidatingContentRepository(
        withInstalledCollections(new InMemoryContentRepository(), store, "site"),
    );
    const projected = (await repository.getBlocRecord("test-action"))!.artifact!;
    expect(projected.slots[""]).toEqual({
        accepts: [{ kind: "native-element", accepts: ["button", "a"] }],
        min: 1,
        max: 1,
    });
    expect((await createContentReader(repository).getRenderableBlocs()).find(({ id }) => id === "test-action")).toEqual(
        expect.objectContaining({ root: { accepts: ["div"] } }),
    );
    await repository.insertPage(
        "/native-button",
        "Button",
        '<div cms-bloc=\"test-action\" wrapper-label="Wrapper label"><button type="button">Save</button></div>',
    );
    await repository.insertPage("/about", "About");
    await repository.insertPage(
        "/native-link",
        "Link",
        '<div cms-bloc=\"test-action\" wrapper-label="Wrapper label"><a href="/about">About</a></div>',
    );
    await expect(
        repository.insertPage("/native-wrong", "Wrong", '<div cms-bloc="test-action"><p>Wrong</p></div>'),
    ).rejects.toThrow("does not accept native <p>");
});

test("installed Bloc insertion uses its example without reading unrelated assets", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(release);
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");
    const projected = (await repository.getBlocRecord("test-heading"))!.artifact!;
    expect(projected.initialDocument?.html).toContain('cms-bloc="test-heading"');
    expect(projected.thumbnail).toBeUndefined();
});

test("installed hybrid component keeps its fixed Light DOM and page defaults distinct", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const artifact = await store.importRelease(
        collectionFixture({
            ...release,
            blocs: [
                {
                    description: "bloc.card.label",
                    categories: ["bloc.card.label"],

                    kind: "component",
                    root: { accepts: ["div"] },
                    id: "test-card",
                    label: "bloc.card.label",
                    markup: '<article><slot name="title"></slot><section><p>{{ cms.i18n.test.title }}</p></section></article>',
                    exampleContent: '<h2 slot="title">{{ cms.i18n.test.title }}</h2>',
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
                    slots: { title: { accepts: [{ kind: "native-content", profile: "inline" }] } },
                },
            ],
        }),
    );
    await store.install("site", artifact.digest, 0);
    const repository = withInstalledCollections(new InMemoryContentRepository(), store, "site");
    const record = (await repository.getBlocRecord("test-card"))!;
    expect(record.artifact?.markupHTML).toContain("cms.i18n.test.title");
    expect(record.artifact?.initialDocument?.html).toContain('<h2 slot="title">{{ cms.i18n.test.title }}</h2>');
    expect(record.artifact?.settings?.map((item) => [item.id, item.default])).toEqual([
        ["tone", "quiet"],
        ["compact", false],
    ]);
    expect((await createContentReader(repository).getRenderableBlocs())[0]?.markupHTML).toContain(
        "cms.i18n.test.title",
    );
    const { document } = parseHTML(
        '<html><body><div cms-bloc=\"test-card\"><h2 slot="title">My page</h2></div></body></html>',
    );
    expandCompositions(document.body, await createContentReader(repository).getRenderableBlocs());
    renderCollectionTexts(document.body, "en", [{ collection: artifact.release }]);
    expect(document.querySelector('[cms-bloc="test-card"]')?.textContent).toBe("My pageWelcome");
    const validated = new ValidatingContentRepository(repository);
    await validated.insertPage("/valid-card", "Valid", '<div cms-bloc=\"test-card\" tone="accent" compact></div>');
    await expect(
        validated.insertPage("/invalid-card", "Invalid", '<div cms-bloc=\"test-card\" tone="unknown"></div>'),
    ).rejects.toThrow("settings are invalid");
});
