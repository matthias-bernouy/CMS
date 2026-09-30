import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { ResolvedCollectionText } from "../../interfaces/CollectionText";
import { parseCollectionTextOverrides, parseCollectionTexts } from "./parseCollectionTexts";
import { textLocale } from "./validation";

/** Regional parents precede the default locale; overrides win within each locale. */
export function resolveCollectionTexts(
    collection: Pick<CollectionRelease, "collectionId" | "locale" | "texts">,
    requestedLocale: string,
    overrides: unknown = {},
): Readonly<Record<string, ResolvedCollectionText>> {
    const locale = textLocale(requestedLocale);
    const fallback = textLocale(collection.locale);
    const definitions = parseCollectionTexts(collection.texts ?? [], fallback);
    const site = parseCollectionTextOverrides(overrides, definitions);
    const candidates: string[] = [locale];
    let candidate = new Intl.Locale(locale).baseName;
    while (candidate) {
        candidates.push(candidate);
        candidate = candidate.includes("-") ? candidate.slice(0, candidate.lastIndexOf("-")) : "";
    }
    candidates.push(fallback);
    return Object.freeze(
        Object.fromEntries(
            definitions.map((definition) => {
                for (const language of new Set(candidates)) {
                    const overridden = site[definition.id];
                    const origin = overridden && Object.hasOwn(overridden, language) ? "site" : "collection";
                    const value = origin === "site" ? overridden![language] : definition.values[language];
                    if (value !== undefined) {
                        return [
                            definition.id,
                            Object.freeze({
                                key: `${collection.collectionId}:${definition.id}`,
                                locale: language,
                                origin,
                                fallback: language !== locale,
                                parameters: definition.parameters,
                                ...(definition.plural ? { plural: definition.plural } : {}),
                                value,
                            }),
                        ];
                    }
                }
                throw new TypeError(`Missing default text: ${definition.id}`);
            }),
        ),
    );
}

/** Pure formatter: emits plain text only, with a visible marker for invalid parameters. */
export function formatCollectionText(value: unknown, parameters: unknown = {}): string {
    const text = value as ResolvedCollectionText | undefined;
    if (!text || typeof text.key !== "string" || !text.parameters || typeof text.locale !== "string") {
        return "[missing text]";
    }
    const marker = `[${text.key}]`;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        return marker;
    }
    const args = parameters as Record<string, unknown>;
    for (const [name, type] of Object.entries(text.parameters)) {
        if (
            !Object.hasOwn(args, name) ||
            typeof args[name] !== type ||
            (type === "number" && !Number.isFinite(args[name])) ||
            (type === "string" && (args[name] as string).length > 8192)
        ) {
            return marker;
        }
    }
    try {
        const message =
            typeof text.value === "string"
                ? text.value
                : (text.value[new Intl.PluralRules(text.locale).select(args[text.plural!] as number)] ??
                  text.value.other);
        if (typeof message !== "string") {
            return marker;
        }
        return message.replace(/\{([a-z][a-z0-9-]*)\}/g, (_match, name: string) =>
            Object.hasOwn(args, name) ? String(args[name]) : marker,
        );
    } catch {
        return marker;
    }
}
