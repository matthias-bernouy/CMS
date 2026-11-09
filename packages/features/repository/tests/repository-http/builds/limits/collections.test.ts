import { resolveCollectionTexts } from "repository/collections/core/texts/resolveCollectionTexts";
import { expect, test } from "bun:test";
import { parseCollectionRelease } from "repository/collections/core/parsing/parseCollectionRelease";
import { collectionDocument, component } from "../../../collections/fixtures";

function document() {
    return { ...collectionDocument(), blocs: [] as Record<string, unknown>[], examples: [] };
}

test("collections admit 1,024 Blocs and refuse the next Bloc", () => {
    const source = document();
    source.blocs = Array.from({ length: 1024 }, (_, id) => ({
        ...component(),
        id: `atlas-dofficial--atlas--item-${id}`,
    }));
    expect(parseCollectionRelease(source).blocs).toHaveLength(1024);
    source.blocs.push({ ...component(), id: "atlas-dofficial--atlas--extra" });
    expect(() => parseCollectionRelease(source)).toThrow();
});

test("collections admit 8,192 texts and refuse the next text", () => {
    const texts = Array.from({ length: 8192 }, (_, id) => ({
        id: `item-${id}`,
        category: "text.category.content",
        group: "text.group.general",
        label: "bloc.panel.label",
        values: { "en-US": "Hello" },
    }));
    const source = { ...document(), texts };
    const release = parseCollectionRelease(source);
    expect(release.texts).toHaveLength(8192);
    const overrides = Object.fromEntries(texts.map(({ id }) => [id, { "en-US": "Updated" }]));
    const resolved = resolveCollectionTexts(release, "en-US", overrides);
    expect(Object.keys(resolved)).toHaveLength(8192);
    expect(resolved["item-8191"]?.value).toBe("Updated");
    expect(() => resolveCollectionTexts(release, "en-US", { ...overrides, unknown: { "en-US": "Invalid" } })).toThrow();
    source.texts.push({ ...texts[0]!, id: "extra" });
    expect(() => parseCollectionRelease(source)).toThrow();
});

test("collections admit 8,192 theme tokens and refuse the next token", () => {
    const entries = Array.from({ length: 8192 }, (_, id) => ({
        id: `color-${id}`,
        label: "bloc.panel.label",
        type: "color",
        defaults: { light: "#000000" },
    }));
    const source = {
        ...document(),
        theme: { label: "bloc.panel.label", categories: [{ id: "colors", label: "bloc.panel.label", entries }] },
    };
    expect(parseCollectionRelease(source).theme!.categories[0]!.entries).toHaveLength(8192);
    source.theme.categories[0]!.entries.push({ ...entries[0]!, id: "extra" });
    expect(() => parseCollectionRelease(source)).toThrow();
});

test("metadata translations support separate labels for large text, theme and Bloc catalogues", () => {
    const source = document();
    const translations = source.translations as Record<string, Record<string, string>>;
    const messages = translations["en-US"]!;
    const remaining = 65_536 - Object.keys(messages).length;
    for (let index = 0; index < remaining; index++) {
        messages[`extra.${index}`] = "Resource";
    }
    expect(Object.keys(parseCollectionRelease(source).translations["en-US"]!)).toHaveLength(65_536);
    messages.extra = "Excess";
    expect(() => parseCollectionRelease(source)).toThrow("65536");
});
