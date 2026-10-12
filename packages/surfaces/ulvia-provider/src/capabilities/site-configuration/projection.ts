import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsLocalizationDependencies } from "../../ports";

export function projectTextCatalogue(
    revision: number,
    installation: Awaited<ReturnType<CmsLocalizationDependencies["collections"]["snapshot"]>>["collections"][number],
    requestedLocale?: string,
) {
    const { collectionId, release, textOverrides } = installation;
    const locale = requestedLocale ?? release.locale;
    return {
        revision,
        collectionId,
        locale,
        overridesJson: JSON.stringify(textOverrides),
        items: (release.texts ?? []).map((text) => ({
            id: text.id,
            generation: text.generation ?? 1,
            ...(text.label ? { label: resolveCollectionTranslation(release, text.label, locale) } : {}),
            ...(text.description
                ? { description: resolveCollectionTranslation(release, text.description, locale) }
                : {}),
            ...(text.category ? { category: resolveCollectionTranslation(release, text.category, locale) } : {}),
            ...(text.group ? { group: resolveCollectionTranslation(release, text.group, locale) } : {}),
            values: Object.entries(text.values)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([locale, value]) => ({ locale, value })),
            overrides: Object.entries(textOverrides)
                .filter(([, values]) => values[text.id] !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([locale, values]) => ({ locale, value: values[text.id]! })),
        })),
    };
}
