import { composeCollectionThemes, type readSystemSnapshot } from "@bernouy/cms-content";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import type { CmsCoreCapabilityStores } from "../dependencies";

export function projectDesignOverview(
    snapshot: Awaited<ReturnType<typeof readSystemSnapshot>>,
    collections: Awaited<ReturnType<CmsCoreCapabilityStores["collections"]["snapshot"]>>,
) {
    const { system, revision } = snapshot;
    const locale = system.site.language.trim() || collections.collections[0]?.release.locale || "en";
    const theme = composeCollectionThemes(
        system.theme,
        collections.collections.map(({ release }) => release),
        locale,
    );
    return {
        revision,
        collectionRevision: collections.revision,
        language: locale,
        additionalLanguages: system.site.additionalLanguages ?? [],
        activeLanguages: system.site.activeLanguages ?? [],
        activeThemeId: theme.activeThemeId,
        themes: theme.themes.map(({ id, name }) => ({ id, name })),
        sources: theme.sources.map((source) => ({
            id: source.id,
            label: source.label,
            supportsModes: source.supportsModes,
            tokenCount: source.categories.reduce((total, category) => total + category.tokens.length, 0),
        })),
        collections: collections.collections.map(({ collectionId, textOverrides, release }) => ({
            collectionId,
            textCount: release.texts?.length ?? 0,
            overriddenLocaleCount: Object.keys(textOverrides).length,
            themeTokenCount:
                release.theme?.categories.reduce((total, category) => total + category.tokens.length, 0) ?? 0,
        })),
    };
}

export function projectTextCatalogue(
    revision: number,
    installation: Awaited<ReturnType<CmsCoreCapabilityStores["collections"]["snapshot"]>>["collections"][number],
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
