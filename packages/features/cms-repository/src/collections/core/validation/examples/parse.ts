import type { CollectionExample, CollectionExamplePreview } from "../../../interfaces/CollectionPage";
import type { CollectionLimits } from "../../limits";
import { invalid } from "../../errors";
import { array, identifier, integer, keys, record, string, unique } from "../../values";

export function parseCollectionExamples(
    value: unknown,
    locale: string,
    limits: Readonly<CollectionLimits>,
): readonly CollectionExample[] {
    const result = array(value, limits.maxBlocs * 4, "$.examples").map((entry, index) => {
        const path = `$.examples[${index}]`;
        const source = record(entry, path);
        keys(source, ["id", "label", "description", "document", "texts", "previews"], path);
        const document = record(source.document, `${path}.document`);
        keys(document, ["html"], `${path}.document`);
        const previews = array(source.previews, 16, `${path}.previews`).map((entry, i) =>
            parsePreview(entry, `${path}.previews[${i}]`, locale),
        );
        if (previews.length === 0) {
            invalid("must contain at least one preview", `${path}.previews`);
        }
        unique(
            previews.map((preview) => preview.id),
            `${path}.previews`,
        );
        return {
            id: identifier(source.id, `${path}.id`),
            label: string(source.label, 120, `${path}.label`),
            description: string(source.description, 4096, `${path}.description`),
            document: { html: string(document.html, limits.maxMarkupLength, `${path}.document.html`) },
            texts: record(source.texts ?? {}, `${path}.texts`) as CollectionExample["texts"],
            previews,
        };
    });
    unique(
        result.map((example) => example.id),
        "$.examples",
    );
    return result.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function parsePreview(value: unknown, path: string, locale: string): CollectionExamplePreview {
    const source = record(value, path);
    keys(source, ["id", "frame", "locale", "themeMode"], path);
    const frame = record(source.frame, `${path}.frame`);
    keys(frame, ["width", "height"], `${path}.frame`);
    const width = integer(frame.width, 1, 4096, `${path}.frame.width`);
    const height = integer(frame.height, 1, 4096, `${path}.frame.height`);
    let language: string;
    try {
        language = Intl.getCanonicalLocales(string(source.locale ?? locale, 64, `${path}.locale`))[0]!;
    } catch {
        return invalid("must be a valid locale", `${path}.locale`);
    }
    const themeMode = source.themeMode ?? "light";
    if (themeMode !== "light" && themeMode !== "dark") {
        invalid("must be light or dark", `${path}.themeMode`);
    }
    return { id: identifier(source.id, `${path}.id`), frame: { width, height }, locale: language, themeMode };
}
