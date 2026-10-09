import { expect, test } from "bun:test";
import { CollectionStore, MemoryCollectionStorage } from "../../../src/exports/collections/installations";
import { collectionDocument } from "../fixtures";

function release(version: string) {
    return {
        ...collectionDocument({
            "theme.category.colors.label": "Colors",
            "theme.label": "Atlas",
            "theme.token.accent.label": "Accent",
            "theme.token.surface.label": "Surface",
        }),
        version,
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
                            defaults: { light: "#123456" },
                        },
                    ],
                },
            ],
        },
    };
}

function actionText() {
    return {
        id: "submit",
        label: "text.label.submit",
        category: "text.category.content",
        group: "text.group.general",
        values: { en: "Submit", "en-US": "Submit" },
    };
}

test("upgrades preserve existing slot contracts and theme token types", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(release("1.0.0"));
    await store.install("site", initial.digest, 0, "local");

    const changedSlot = release("1.1.0");
    ((changedSlot.blocs as Record<string, unknown>[])[0]!.slots as Record<string, unknown>).body = { max: 1 };
    const withChangedSlot = await store.importRelease(changedSlot);
    await expect(store.upgrade("site", withChangedSlot.digest, 1, "local")).rejects.toThrow("slot contract");

    const changedToken = release("1.2.0");
    changedToken.theme.categories[0]!.tokens[0]!.type = "value";
    const withChangedToken = await store.importRelease(changedToken);
    await expect(store.upgrade("site", withChangedToken.digest, 1, "local")).rejects.toThrow("theme token");

    const compatible = release("1.3.0");
    compatible.theme.categories[0]!.tokens[0]!.defaults.light = "#654321";
    compatible.theme.categories[0]!.tokens.push({
        id: "surface",
        label: "theme.token.surface.label",
        type: "color",
        defaults: { light: "#ffffff" },
    });
    const admitted = await store.importRelease(compatible);
    await expect(store.upgrade("site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});

test("simple upgrades cannot bypass a resource generation migration", async () => {
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(release("1.0.0"));
    await store.install("site", initial.digest, 0, "local");

    const changed = release("1.1.0");
    (changed.blocs as Record<string, unknown>[])[0]!.generation = 2;
    const admitted = await store.importRelease(changed);

    await expect(store.upgrade("site", admitted.digest, 1, "local")).rejects.toThrow("resource generation changed");
});

test("upgrades preserve Page and Bloc surface contracts", async () => {
    const initialSource = release("1.0.0");
    initialSource.translations["en-US"]!["page.overview.name"] = "Overview";
    initialSource.pages = [
        {
            id: "overview",
            surface: "control",
            defaultPath: "/admin",
            name: "page.overview.name",
            document: {
                html: `<${(initialSource.blocs as Record<string, unknown>[])[0]!.id}></${(initialSource.blocs as Record<string, unknown>[])[0]!.id}>`,
            },
        },
    ];
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(initialSource);
    await store.install("site", initial.digest, 0, "local");

    const changedPage = structuredClone(initialSource);
    changedPage.version = "1.1.0";
    changedPage.pages[0]!.surface = "delivery";
    changedPage.pages[0]!.defaultPath = "/";
    const pageArtifact = await store.importRelease(changedPage);
    await expect(store.upgrade("site", pageArtifact.digest, 1, "local")).rejects.toThrow("existing Page");

    const narrowedBloc = structuredClone(initialSource);
    narrowedBloc.version = "1.2.0";
    (narrowedBloc.blocs as Record<string, unknown>[]).find(({ id }) => id === "atlas-page")!.surfaces = ["delivery"];
    const blocArtifact = await store.importRelease(narrowedBloc);
    await expect(store.upgrade("site", blocArtifact.digest, 1, "local")).rejects.toThrow("Bloc surfaces");
});

test("upgrades preserve managed native element choices", async () => {
    const managedRelease = (version: string, accepts: string[], root: string) => {
        const source = release(version);
        source.texts = [actionText()];
        source.blocs = [
            {
                kind: "component",
                id: "atlas-action",
                label: "bloc.panel.label",
                nativeElement: { accepts },
                shadowdom: "<slot></slot>",
                defaultContent: `<${root}>{{ cms.i18n.atlas.submit }}</${root}>`,
                uses: [],
                requires: [],
                slots: {},
            },
        ];
        return source;
    };
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(managedRelease("1.0.0", ["button", "a"], "button"));
    await store.install("site", initial.digest, 0, "local");
    const changed = await store.importRelease(managedRelease("1.1.0", ["button"], "button"));

    await expect(store.upgrade("site", changed.digest, 1, "local")).rejects.toThrow("managed native contract");
});

test("upgrades accept wider slot and managed native contracts", async () => {
    const initial = release("1.0.0");
    initial.texts = [actionText()];
    const panel = (initial.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    panel.slots = { body: { min: 1, max: 1 } };
    const managed = {
        kind: "component",
        id: "atlas-action",
        label: "bloc.panel.label",
        nativeElement: { accepts: ["button"] },
        shadowdom: "<slot></slot>",
        defaultContent: "<button>{{ cms.i18n.atlas.submit }}</button>",
        uses: [],
        requires: [],
        slots: {},
    };
    initial.blocs = [...initial.blocs, managed];
    const store = new CollectionStore(new MemoryCollectionStorage());
    const first = await store.importRelease(initial);
    await store.install("site", first.digest, 0, "local");

    const next = structuredClone(initial);
    next.version = "1.1.0";
    const nextPanel = (next.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    nextPanel.slots = { body: { min: 0, max: 2 } };
    const nextManaged = (next.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-action")!;
    nextManaged.nativeElement = { accepts: ["button", "a"] };
    const admitted = await store.importRelease(next);

    await expect(store.upgrade("site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});

test("upgrades allow setting presentation changes while preserving the stored value contract", async () => {
    const initial = release("1.0.0");
    for (const messages of Object.values(initial.translations)) {
        messages["setting.tone.label"] = "Tone";
        messages["setting.tone.help"] = "Choose a tone";
        messages["setting.compact.label"] = "Compact";
    }
    const panel = (initial.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    panel.settings = [
        {
            id: "tone",
            label: "setting.tone.label",
            help: "setting.tone.help",
            type: "string",
            default: "quiet",
            maxLength: 16,
            control: { kind: "text" },
        },
        {
            id: "compact",
            label: "setting.compact.label",
            type: "boolean",
            default: false,
            control: { kind: "toggle" },
        },
    ];
    const store = new CollectionStore(new MemoryCollectionStorage());
    const first = await store.importRelease(initial);
    await store.install("site", first.digest, 0, "local");

    const next = structuredClone(initial);
    next.version = "1.1.0";
    for (const messages of Object.values(next.translations)) {
        messages["setting.tone.help"] = "Updated author guidance";
        messages["setting.layout.label"] = "Layout";
    }
    const nextPanel = (next.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    nextPanel.settings = [
        nextPanel.settings[1],
        { ...nextPanel.settings[0], default: "calm", maxLength: 32 },
        {
            id: "layout",
            label: "setting.layout.label",
            type: "string",
            default: "stack",
            control: { kind: "text" },
        },
    ];
    const admitted = await store.importRelease(next);

    await expect(store.upgrade("site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});
