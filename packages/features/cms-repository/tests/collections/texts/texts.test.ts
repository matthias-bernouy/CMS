import { expect, test } from "bun:test";
import { admitCollectionRelease, parseCollectionRelease } from "../../../src/exports/collections";
import {
    formatCollectionText,
    parseCollectionTexts,
    resolveCollectionTexts,
} from "../../../src/exports/collections/texts";
import { collectionDocument } from "../fixtures";

const definitions = [
    { id: "title", values: { en: "Order", fr: "Commande" } },
    { id: "greeting", parameters: { name: "string" }, values: { en: "Hello {name}" } },
    {
        id: "items",
        parameters: { count: "number" },
        plural: "count",
        values: {
            en: { one: "{count} item", other: "{count} items" },
            fr: { one: "{count} article", other: "{count} articles" },
        },
    },
];
const release = () => parseCollectionRelease({ ...collectionDocument(), locale: "en", texts: definitions });

test("collection admission normalizes texts and includes them in immutable release identity", async () => {
    const input = { ...collectionDocument(), locale: "en", texts: structuredClone(definitions) };
    const first = await admitCollectionRelease(input);
    input.texts[0]!.values.en = "Changed";
    expect(first.release.texts?.find((text) => text.id === "title")?.values.en).toBe("Order");
    expect(Object.isFrozen(first.release.texts)).toBe(true);
    expect((await admitCollectionRelease(input)).digest).not.toBe(first.digest);
    input.texts = [...structuredClone(definitions)].reverse();
    expect((await admitCollectionRelease(input)).digest).toBe(first.digest);
});

test("locale resolution is per key with regional fallback and site overrides", () => {
    const source = release();
    const texts = resolveCollectionTexts(source, "fr-CA", { title: { fr: "Votre commande" } });
    expect(texts.title).toMatchObject({ locale: "fr", origin: "site", fallback: true });
    expect(formatCollectionText(texts.title)).toBe("Votre commande");
    expect(texts.greeting).toMatchObject({ locale: "en", origin: "collection", fallback: true });
    expect(formatCollectionText(texts.greeting, { name: "Alex" })).toBe("Hello Alex");
    expect(source.texts?.find((text) => text.id === "title")?.values.fr).toBe("Commande");
    expect(formatCollectionText(resolveCollectionTexts(source, "de").title)).toBe("Order");
});

test("plural selection uses the locale of the resolved message", () => {
    const en = resolveCollectionTexts(release(), "en");
    const fr = resolveCollectionTexts(release(), "fr");
    expect(formatCollectionText(en.items, { count: 0 })).toBe("0 items");
    expect(formatCollectionText(fr.items, { count: 0 })).toBe("0 article");
    expect(formatCollectionText(en.items, { count: 1 })).toBe("1 item");
    expect(formatCollectionText(fr.items, { count: 2 })).toBe("2 articles");
    expect(formatCollectionText(resolveCollectionTexts(release(), "de").items, { count: 1 })).toBe("1 item");
});

test("parameter interpolation is literal and never evaluates nested placeholders", () => {
    const texts = resolveCollectionTexts(release(), "en");
    expect(formatCollectionText(texts.greeting, { name: "<img src=x onerror=alert(1)>{count}" })).toBe(
        "Hello <img src=x onerror=alert(1)>{count}",
    );
    expect(formatCollectionText(texts.greeting)).toBe("[atlas:greeting]");
    expect(formatCollectionText(texts.items, { count: "2" })).toBe("[atlas:items]");
    expect(formatCollectionText(texts.items, { count: NaN })).toBe("[atlas:items]");
    expect(formatCollectionText(undefined)).toBe("[missing text]");
});

test.each([
    [{ id: "title", values: { fr: "Missing default" } }],
    [{ id: "title", values: { en: "Unknown {name}" } }],
    [{ id: "title", values: { en: "Unclosed {" } }],
    [{ id: "title", values: { en: "Title" }, html: true }],
    [
        { id: "title", values: { en: "Title" } },
        { id: "title", values: { en: "Duplicate" } },
    ],
    [{ id: "constructor", values: { en: "Unsafe key" } }],
    [{ id: "items", plural: "count", parameters: { count: "string" }, values: { en: { other: "Items" } } }],
    [{ id: "items", plural: "count", parameters: { count: "number" }, values: { en: { one: "Item" } } }],
    [{ id: "title", values: { en: "x".repeat(8193) } }],
])("rejects invalid text definitions", (...values) => {
    expect(() => parseCollectionRelease({ ...collectionDocument(), locale: "en", texts: values })).toThrow();
});

test("normalization rejects aliases of the same locale and sparse definitions", () => {
    expect(() => parseCollectionTexts([{ id: "title", values: { "en-us": "A", "en-US": "B" } }], "en-US")).toThrow();
    expect(() => parseCollectionTexts(new Array(1), "en")).toThrow();
    expect(() => resolveCollectionTexts(release(), "en", { unknown: { en: "No" } })).toThrow();
    expect(() => resolveCollectionTexts(release(), "en", { title: { en: "Bad {extra}" } })).toThrow();
});
