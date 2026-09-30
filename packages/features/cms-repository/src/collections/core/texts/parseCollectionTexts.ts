import type { CollectionText, CollectionTextOverrides, TextParameterType } from "../../interfaces/CollectionText";
import { parseTextLocales, TEXT_LIMITS, textIdentifier, textKeys, textLocale, textRecord } from "./validation";

export function parseCollectionTexts(value: unknown, defaultLocale: string): readonly CollectionText[] {
    if (
        !Array.isArray(value) ||
        value.length > TEXT_LIMITS.definitions ||
        Object.keys(value).length !== value.length ||
        Object.keys(value).some((key, i) => key !== String(i))
    ) {
        throw new TypeError("Texts must be a bounded dense array");
    }
    const locale = textLocale(defaultLocale);
    const texts = value.map((item) => {
        const source = textRecord(item);
        textKeys(source, ["id", "parameters", "plural", "values"]);
        const id = textIdentifier(source.id);
        const entries = Object.entries(textRecord(source.parameters ?? {}));
        if (entries.length > TEXT_LIMITS.parameters) {
            throw new TypeError("Too many text parameters");
        }
        const parameters = Object.freeze(
            Object.fromEntries(
                entries.sort().map(([name, type]) => {
                    textIdentifier(name);
                    if (type !== "string" && type !== "number") {
                        throw new TypeError("Text parameters must declare string or number");
                    }
                    return [name, type as TextParameterType];
                }),
            ),
        );
        const plural = source.plural === undefined ? undefined : textIdentifier(source.plural);
        if (plural && parameters[plural] !== "number") {
            throw new TypeError("Plural selection requires a declared number parameter");
        }
        const values = parseTextLocales(source.values, parameters, plural);
        if (!Object.hasOwn(values, locale)) {
            throw new TypeError(`Text ${id} is missing its default locale ${locale}`);
        }
        return Object.freeze({ id, parameters, ...(plural ? { plural } : {}), values });
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
                return [id, parseTextLocales(values, definition.parameters, definition.plural)];
            }),
        ),
    );
}
