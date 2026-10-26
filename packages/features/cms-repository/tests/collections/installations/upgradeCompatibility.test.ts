import { reviewedUpgrade } from "./upgrades/reviewed";
import { collectionFixture } from "../admission/examples/buildFixture";
import { expect, test } from "bun:test";
import {
    assertCompatibleCollectionUpgrade,
    CollectionStore,
    collectionUpgradeBreakingResources,
    MemoryCollectionStorage,
} from "../../../src/exports/collections/installations";
import type { CollectionRelease } from "../../../src/exports/collections";
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
                    entries: [
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
    const initial = await store.importRelease(collectionFixture(release("1.0.0")));
    await store.install("site", initial.digest, 0, "local");

    const changedSlot = release("1.1.0");
    ((changedSlot.blocs as Record<string, unknown>[])[0]!.slots as Record<string, unknown>).body = { max: 1 };
    const withChangedSlot = await store.importRelease(collectionFixture(changedSlot));
    await expect(reviewedUpgrade(store, "site", withChangedSlot.digest, 1, "local")).rejects.toThrow(
        "new resource identity",
    );

    const changedToken = release("1.2.0");
    changedToken.theme.categories[0]!.entries[0]!.type = "value";
    const withChangedToken = await store.importRelease(collectionFixture(changedToken));
    await expect(reviewedUpgrade(store, "site", withChangedToken.digest, 1, "local")).rejects.toThrow(
        "new resource identity",
    );

    const compatible = release("1.3.0");
    compatible.theme.categories[0]!.entries[0]!.defaults.light = "#654321";
    compatible.theme.categories[0]!.entries.push({
        id: "surface",
        label: "theme.token.surface.label",
        type: "color",
        defaults: { light: "#ffffff" },
    });
    const admitted = await store.importRelease(collectionFixture(compatible));
    await expect(reviewedUpgrade(store, "site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});

test("asset profiles may expand but cannot remove an existing rendering guarantee", () => {
    const previous = release("1.0.0");
    previous.assets = [
        {
            id: "icons/check.svg",
            mediaType: "image/svg+xml",
            byteLength: 1,
            digest: `sha256:${"0".repeat(64)}`,
        },
    ];
    const expanded = structuredClone(previous);
    expanded.version = "1.1.0";
    expanded.assets[0]!.profiles = ["inline-svg"];

    expect(() =>
        assertCompatibleCollectionUpgrade(
            previous as unknown as CollectionRelease,
            expanded as unknown as CollectionRelease,
        ),
    ).not.toThrow();
    expect(
        collectionUpgradeBreakingResources(
            expanded as unknown as CollectionRelease,
            previous as unknown as CollectionRelease,
        ),
    ).toEqual([
        {
            kind: "asset",
            id: "icons/check.svg",
            reason: "asset icons/check.svg was removed or changed",
        },
    ]);
});

test("collection admission rejects obsolete resource generation fields", async () => {
    const source = release("2.0.0");
    (source.blocs as Record<string, unknown>[])[0]!.generation = 2;
    const store = new CollectionStore(new MemoryCollectionStorage());
    await expect(store.importRelease(collectionFixture(source))).rejects.toThrow('unknown property "generation"');
});

test("upgrades preserve Page identities while allowing route changes", async () => {
    const initialSource = release("1.0.0");
    initialSource.translations["en-US"]!["page.overview.name"] = "Overview";
    initialSource.pages = [
        {
            id: "overview",
            defaultPath: "/admin",
            name: "page.overview.name",
            document: {
                html: `<div cms-bloc=\"${(initialSource.blocs as Record<string, unknown>[])[0]!.id}\"></div>`,
            },
        },
    ];
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(collectionFixture(initialSource));
    await store.install("site", initial.digest, 0, "local");

    const changedPage = structuredClone(initialSource);
    changedPage.version = "1.1.0";
    changedPage.pages[0]!.defaultPath = "/";
    const pageArtifact = await store.importRelease(collectionFixture(changedPage));
    await expect(reviewedUpgrade(store, "site", pageArtifact.digest, 1, "local")).resolves.toMatchObject({
        revision: 2,
    });

    const removedPage = structuredClone(changedPage);
    removedPage.version = "1.2.0";
    removedPage.pages = [];
    const removedArtifact = await store.importRelease(collectionFixture(removedPage));
    await expect(reviewedUpgrade(store, "site", removedArtifact.digest, 2, "local")).rejects.toThrow(
        "major publication",
    );
});

test("upgrades preserve managed native element choices", async () => {
    const managedRelease = (version: string, accepts: string[], root: string) => {
        const source = release(version);
        source.texts = [actionText()];
        source.blocs = [
            {
                description: "bloc.panel.label",
                categories: ["bloc.panel.label"],

                kind: "component",
                id: "atlas-action",
                label: "bloc.panel.label",
                root: { accepts: ["div"] },
                markup: "<slot></slot>",
                exampleContent: `<${root}>{{ cms.i18n.atlas.submit }}</${root}>`,
                uses: [],
                requires: [],
                slots: {
                    default: {
                        accepts: [{ kind: "native-element", accepts }],
                        min: 1,
                        max: 1,
                    },
                },
            },
        ];
        return source;
    };
    const store = new CollectionStore(new MemoryCollectionStorage());
    const initial = await store.importRelease(collectionFixture(managedRelease("1.0.0", ["button", "a"], "button")));
    await store.install("site", initial.digest, 0, "local");
    const changed = await store.importRelease(collectionFixture(managedRelease("1.1.0", ["button"], "button")));

    await expect(reviewedUpgrade(store, "site", changed.digest, 1, "local")).rejects.toThrow("new resource identity");
});

test("upgrades accept wider slot and managed native contracts", async () => {
    const initial = release("1.0.0");
    initial.texts = [actionText()];
    const panel = (initial.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    panel.defaultExample = undefined;
    panel.slots = { body: { accepts: [{ kind: "native-content", profile: "prose" }], min: 1, max: 1 } };
    const managed = {
        description: "bloc.panel.label",
        categories: ["bloc.panel.label"],

        kind: "component",
        id: "atlas-action",
        label: "bloc.panel.label",
        root: { accepts: ["div"] },
        markup: "<slot></slot>",
        exampleContent: "<button>{{ cms.i18n.atlas.submit }}</button>",
        uses: [],
        requires: [],
        slots: {
            default: {
                accepts: [{ kind: "native-element", accepts: ["button"] }],
                min: 1,
                max: 1,
            },
        },
    };
    initial.blocs = [...initial.blocs, managed];
    const store = new CollectionStore(new MemoryCollectionStorage());
    const first = await store.importRelease(collectionFixture(initial));
    await store.install("site", first.digest, 0, "local");

    const next = structuredClone(initial);
    next.version = "1.1.0";
    const nextPanel = (next.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-panel")!;
    nextPanel.slots = { body: { accepts: [{ kind: "native-content", profile: "prose" }], min: 0, max: 2 } };
    const nextManaged = (next.blocs as Record<string, unknown>[]).find((bloc) => bloc.id === "atlas-action")!;
    nextManaged.slots = {
        default: {
            accepts: [{ kind: "native-element", accepts: ["button", "a"] }],
            min: 1,
            max: 1,
        },
    };
    const admitted = await store.importRelease(collectionFixture(next));

    await expect(reviewedUpgrade(store, "site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
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
    const first = await store.importRelease(collectionFixture(initial));
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
    const admitted = await store.importRelease(collectionFixture(next));

    await expect(reviewedUpgrade(store, "site", admitted.digest, 1, "local")).resolves.toMatchObject({ revision: 2 });
});
