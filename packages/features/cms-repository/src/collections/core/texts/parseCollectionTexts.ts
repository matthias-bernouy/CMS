import { resourceMetadata } from "../validation/lifecycle/metadata";
import type { CollectionText, CollectionTextOverrides } from "../../interfaces/CollectionText";
import { parseTextLocales, TEXT_LIMITS, textIdentifier, textKeys, textLocale, textRecord } from "./validation";

export function parseCollectionTexts(
    value: unknown,
    defaultLocale: string,
    maximum: number = TEXT_LIMITS.definitions,
): readonly CollectionText[] {
    if (
        !Array.isArray(value) ||
        value.length > maximum ||
        Object.keys(value).length !== value.length ||
        Object.keys(value).some((key, i) => key !== String(i))
    ) {
        throw new TypeError("Texts must be a bounded dense array");
    }
    const locale = textLocale(defaultLocale);
    const texts = value.map((item) => {
        const source = textRecord(item);
        textKeys(source, ["id", "deprecation", "label", "description", "category", "group", "values"]);
        const id = textIdentifier(source.id);
        const label = textMetadata(source.label, "label", 120);
        const category = textMetadata(source.category, "category", 120);
        const group = textMetadata(source.group, "group", 120);
        const description =
            source.description === undefined
                ? {}
                : { description: textMetadata(source.description, "description", 500) };
        const values = parseTextLocales(source.values);
        if (!Object.hasOwn(values, locale)) {
            throw new TypeError(`Text ${id} is missing its default locale ${locale}`);
        }
        return Object.freeze({
            id,
            ...resourceMetadata(source, `$.texts.${id}`),
            label,
            category,
            group,
            ...description,
            values,
        });
    });
    if (new Set(texts.map(({ id }) => id)).size !== texts.length) {
        throw new TypeError("Duplicate text ID");
    }
    return Object.freeze(texts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

function textMetadata(value: unknown, key: "label" | "description" | "category" | "group", maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) {
        throw new TypeError(`Invalid or missing text ${key}`);
    }
    return value;
}

export function parseCollectionTextOverrides(
    value: unknown,
    definitions: readonly CollectionText[],
): CollectionTextOverrides {
    const entries = Object.entries(textRecord(value));
    if (entries.length > TEXT_LIMITS.definitions) {
        throw new TypeError("Too many text overrides");
    }
    return Object.freeze(
        Object.fromEntries(
            entries.sort().map(([id, values]) => {
                const definition = definitions.find((text) => text.id === id);
                if (!definition) {
                    throw new TypeError(`Unknown overridden text: ${id}`);
                }
                return [id, parseTextLocales(values)];
            }),
        ),
    );
}
