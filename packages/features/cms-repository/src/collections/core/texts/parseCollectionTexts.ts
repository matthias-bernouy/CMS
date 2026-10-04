import type { CollectionText, CollectionTextOverrides } from "../../interfaces/CollectionText";
import { integer } from "../values";
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
        textKeys(source, ["id", "generation", "label", "description", "category", "group", "values"]);
        const id = textIdentifier(source.id);
        const generation =
            source.generation === undefined
                ? 1
                : integer(source.generation, 1, Number.MAX_SAFE_INTEGER, `$.texts.${id}.generation`);
        const metadata = Object.fromEntries(
            ["label", "description", "category", "group"].flatMap((key) => {
                const value = source[key];
                if (value === undefined) {
                    return [];
                }
                if (typeof value !== "string" || !value.trim() || value.length > (key === "description" ? 500 : 120)) {
                    throw new TypeError(`Invalid text ${key}`);
                }
                return [[key, value]];
            }),
        );
        const values = parseTextLocales(source.values);
        if (!Object.hasOwn(values, locale)) {
            throw new TypeError(`Text ${id} is missing its default locale ${locale}`);
        }
        return Object.freeze({ id, generation, ...metadata, values });
    });
    if (new Set(texts.map(({ id }) => id)).size !== texts.length) {
        throw new TypeError("Duplicate text ID");
    }
    return Object.freeze(texts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
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
