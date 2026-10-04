import {
    collectionThemeSourceId,
    collectionThemeTokenId,
    resolveCollectionTranslation,
    type CollectionRelease,
} from "@bernouy/cms-repository/collections";
import type { ThemeSettings, ThemeSource } from "cms-content/theme/interfaces/theme";
import { validateThemeSettings } from "cms-content/theme/core/validation";

export function collectionThemeSource(release: CollectionRelease, locale?: string): ThemeSource | null {
    if (!release.theme) {
        return null;
    }
    const themeTokenImports =
        release.dependencies?.flatMap((dependency) =>
            dependency.imports.themeTokens.map(({ id }) => collectionThemeTokenId(dependency.collectionId, id)),
        ) ?? [];
    return {
        id: collectionThemeSourceId(release.collectionId),
        label: resolveCollectionTranslation(release, release.theme.label, locale),
        supportsModes: release.theme.categories.some((category) =>
            category.tokens.some((token) => token.defaults.dark !== undefined),
        ),
        owner: {
            kind: "collection",
            collectionId: release.collectionId,
            ...(themeTokenImports.length ? { themeTokenImports } : {}),
        },
        categories: release.theme.categories.map((category) => ({
            id: category.id,
            label: resolveCollectionTranslation(release, category.label, locale),
            description: category.description
                ? resolveCollectionTranslation(release, category.description, locale)
                : "",
            tokens: category.tokens.map((token) => ({
                id: collectionThemeTokenId(release.collectionId, token.id),
                variable: collectionThemeTokenId(release.collectionId, token.id),
                label: resolveCollectionTranslation(release, token.label, locale),
                description: token.description ? resolveCollectionTranslation(release, token.description, locale) : "",
                type: token.type,
                defaults: { ...token.defaults },
            })),
        })),
    };
}

/** The admitted release owns the catalogue; site theme values remain overrides. */
export function composeCollectionThemes(
    base: ThemeSettings,
    releases: readonly CollectionRelease[],
    locale?: string,
): ThemeSettings {
    const sources = releases
        .map((release) => collectionThemeSource(release, locale))
        .filter((source): source is ThemeSource => source !== null);
    const next = structuredClone(base);
    const oldTokens = new Set(
        next.sources
            .filter((source) => source.owner?.kind === "collection")
            .flatMap((source) => source.categories.flatMap((category) => category.tokens.map((token) => token.id))),
    );
    next.sources = [...next.sources.filter((source) => source.owner?.kind !== "collection"), ...sources];
    const activeTokens = new Set(
        next.sources.flatMap((source) =>
            source.categories.flatMap((category) => category.tokens.map((token) => token.id)),
        ),
    );
    for (const theme of next.themes) {
        for (const mode of ["light", "dark"] as const) {
            for (const tokenId of Object.keys(theme.values[mode])) {
                if (oldTokens.has(tokenId) && !activeTokens.has(tokenId)) {
                    delete theme.values[mode][tokenId];
                }
            }
        }
    }
    return validateThemeSettings(next);
}
