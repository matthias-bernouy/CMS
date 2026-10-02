import type { CollectionRelease, CollectionTranslations } from "../../interfaces/CollectionRelease";
import { invalid } from "../errors";
import { record, string } from "../values";

const KEY = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const MAX_LOCALES = 32;
const MAX_MESSAGES = 1024;
const MAX_VALUE_LENGTH = 4096;

export function parseCollectionTranslationKey(value: unknown, path: string): string {
    const key = string(value, 160, path);
    if (!KEY.test(key) || ["constructor", "prototype"].includes(key)) {
        invalid("must be a lowercase collection translation key", path);
    }
    return key;
}

export function parseCollectionTranslations(input: unknown, defaultLocale: string): CollectionTranslations {
    const source = record(input, "$.translations");
    const entries = Object.entries(source);
    if (entries.length === 0 || entries.length > MAX_LOCALES) {
        invalid(`must define between 1 and ${MAX_LOCALES} locales`, "$.translations");
    }
    const translations: Record<string, Readonly<Record<string, string>>> = {};
    for (const [rawLocale, value] of entries) {
        const locale = collectionTranslationLocale(rawLocale, `$.translations[${JSON.stringify(rawLocale)}]`);
        if (Object.hasOwn(translations, locale)) {
            invalid("must not contain duplicate canonical locales", "$.translations");
        }
        const messages = Object.entries(record(value, `$.translations[${JSON.stringify(rawLocale)}]`));
        if (messages.length > MAX_MESSAGES) {
            invalid(`must contain at most ${MAX_MESSAGES} messages`, `$.translations[${JSON.stringify(rawLocale)}]`);
        }
        translations[locale] = Object.fromEntries(
            messages
                .map(([rawKey, candidate]) => {
                    const path = `$.translations[${JSON.stringify(rawLocale)}][${JSON.stringify(rawKey)}]`;
                    const key = parseCollectionTranslationKey(rawKey, path);
                    const message = string(candidate, MAX_VALUE_LENGTH, path);
                    if (!message.trim() || /[{}]/u.test(message)) {
                        invalid("must be nonblank static text without interpolation", path);
                    }
                    return [key, message] as const;
                })
                .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
        );
    }
    const fallback = translations[defaultLocale];
    if (!fallback) {
        invalid(`must define the collection locale ${JSON.stringify(defaultLocale)}`, "$.translations");
    }
    for (const [locale, messages] of Object.entries(translations)) {
        for (const key of Object.keys(messages)) {
            if (!Object.hasOwn(fallback, key)) {
                invalid(
                    "must not translate a key absent from the collection locale",
                    `$.translations[${JSON.stringify(locale)}][${JSON.stringify(key)}]`,
                );
            }
        }
    }
    return Object.fromEntries(
        Object.entries(translations).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    );
}

/** Resolve exact, regional-parent, then collection-default copy. */
export function resolveCollectionTranslation(
    collection: Pick<CollectionRelease, "locale" | "translations">,
    key: string,
    requestedLocale: string = collection.locale,
): string {
    const locale = collectionTranslationLocale(requestedLocale, "requested locale");
    const fallback = collectionTranslationLocale(collection.locale, "collection locale");
    const candidates = [locale];
    let parent = new Intl.Locale(locale).baseName;
    while (parent.includes("-")) {
        parent = parent.slice(0, parent.lastIndexOf("-"));
        candidates.push(parent);
    }
    candidates.push(fallback);
    for (const candidate of new Set(candidates)) {
        const value = collection.translations[candidate]?.[key];
        if (value !== undefined) {
            return value;
        }
    }
    throw new TypeError(`Missing collection translation: ${key}`);
}

function collectionTranslationLocale(value: unknown, path: string): string {
    const locale = string(value, 64, path);
    try {
        return Intl.getCanonicalLocales(locale)[0]!;
    } catch {
        return invalid("must be a BCP 47 locale", path);
    }
}
