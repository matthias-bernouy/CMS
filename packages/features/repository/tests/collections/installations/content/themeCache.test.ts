import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import type { CollectionRelease } from "repository/collections/interfaces/CollectionRelease";
import { createCollectionThemeComposer } from "repository/collections/integration/content/themeCache";

function collection(label: string): CollectionRelease {
    return {
        collectionId: "example/test",
        locale: "en",
        translations: { en: { "theme.label": label, "theme.colors": "Colors", "theme.accent": "Accent" } },
        theme: {
            label: "theme.label",
            categories: [
                {
                    id: "colors",
                    label: "theme.colors",
                    entries: [{ id: "accent", label: "theme.accent", type: "color", defaults: { light: "#123456" } }],
                },
            ],
        },
    } as CollectionRelease;
}

test("theme composition refreshes for site inputs and installation revisions without sharing mutable output", async () => {
    const base = (await new InMemoryContentRepository().getSystem()).theme;
    const compose = createCollectionThemeComposer();
    const first = compose(base, 1, [collection("Original")]);
    first.sources.find((source) => source.id === "contribution-example--test")!.label = "Caller mutation";
    expect(
        compose(base, 1, [collection("Original")]).sources.find((source) => source.id === "contribution-example--test")!
            .label,
    ).toBe("Original");
    expect(
        compose(base, 2, [collection("Updated")]).sources.find((source) => source.id === "contribution-example--test")!
            .label,
    ).toBe("Updated");
    const changedBase = structuredClone(base);
    changedBase.themes[0]!.values.light["example--test--accent"] = "#abcdef";
    expect(compose(changedBase, 2, [collection("Updated")]).themes[0]!.values.light["example--test--accent"]).toBe(
        "#abcdef",
    );
    expect(compose(base, 3, []).sources.some((source) => source.id === "contribution-example--test")).toBe(false);
    expect(
        createCollectionThemeComposer()(base, 1, [collection("Other instance")]).sources.find(
            (source) => source.id === "contribution-example--test",
        )!.label,
    ).toBe("Other instance");
});
