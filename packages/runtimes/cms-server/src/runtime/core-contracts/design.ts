import { composeCollectionThemes, type CoreCapabilityRegistry } from "@bernouy/cms-content";
import type { CoreStores } from "../stores/core";

export function registerDesignCapabilities(dispatcher: CoreCapabilityRegistry, core: CoreStores): void {
    dispatcher.register("ulvia.cms.design", "overview", async () => {
        const [system, snapshot] = await Promise.all([core.repo.getSystem(), core.collections.snapshot("default")]);
        const theme = composeCollectionThemes(
            system.theme,
            snapshot.collections.map(({ release }) => release),
            system.site.language,
        );
        return {
            language: system.site.language,
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
            collections: snapshot.collections.map(({ collectionId, textOverrides, release }) => ({
                collectionId,
                textCount: release.texts?.length ?? 0,
                overriddenLocaleCount: Object.keys(textOverrides).length,
                themeTokenCount:
                    release.theme?.categories.reduce((total, category) => total + category.tokens.length, 0) ?? 0,
            })),
        };
    });
}
