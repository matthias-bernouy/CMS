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
