import { expect, test } from "bun:test";
import { admitCollectionRelease, parseCollectionRelease } from "../../../src/exports/collections";
import { parseCollectionTexts, resolveCollectionTexts } from "../../../src/exports/collections/texts";
import { collectionDocument } from "../fixtures";

const definitions = [
    { id: "title", values: { en: "Order", fr: "Commande" } },
    { id: "greeting", values: { en: "Hello" } },
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
    expect(texts.title?.value).toBe("Votre commande");
    expect(texts.greeting).toMatchObject({ locale: "en", origin: "collection", fallback: true });
    expect(texts.greeting?.value).toBe("Hello");
    expect(source.texts?.find((text) => text.id === "title")?.values.fr).toBe("Commande");
    expect(resolveCollectionTexts(source, "de").title?.value).toBe("Order");
});

test.each([
    [{ id: "title", values: { fr: "Missing default" } }],
    [{ id: "title", values: { en: "Unknown {name}" } }],
    [{ id: "title", values: { en: "Unclosed {" } }],
    [{ id: "title", values: { en: "Title" }, html: true }],
    [{ id: "title", parameters: { name: "string" }, values: { en: "Title" } }],
    [{ id: "title", plural: "count", values: { en: "Title" } }],
    [{ id: "title", values: { en: { other: "Title" } } }],
    [
        { id: "title", values: { en: "Title" } },
        { id: "title", values: { en: "Duplicate" } },
    ],
    [{ id: "constructor", values: { en: "Unsafe key" } }],
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

test("text catalogue preserves bounded navigation and label metadata", () => {
    const text = {
        id: "title",
        label: "Welcome title",
        description: "Main heading",
        category: "Storefront",
        group: "Welcome",
        values: { en: "Hello" },
    };
    expect(parseCollectionTexts([text], "en")[0]).toMatchObject(text);
    for (const key of ["label", "description", "category", "group"]) {
        expect(() => parseCollectionTexts([{ ...text, [key]: " " }], "en")).toThrow();
        expect(() => parseCollectionTexts([{ ...text, [key]: "x".repeat(501) }], "en")).toThrow();
    }
});
