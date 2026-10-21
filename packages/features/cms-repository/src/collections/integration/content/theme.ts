import {
    collectionThemeSourceId,
    collectionThemeTokenId,
    resolveCollectionTranslation,
    type CollectionRelease,
} from "@bernouy/cms-repository/collections";
import { validateThemeSettings, type ThemeSettings, type ThemeSource } from "@bernouy/cms-content";

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
            category.entries.some((entry) => entry.type !== "font-face" && entry.defaults.dark !== undefined),
        ),
        fontFaces: release.theme.categories.flatMap((category) =>
            category.entries.flatMap((entry) =>
                entry.type === "font-face"
                    ? [
                          {
                              id: `${release.collectionId}-${entry.id}`,
                              family: `${release.collectionId}-${entry.family}`,
                              source: `{{ cms.asset.${release.collectionId}.${entry.asset} }}`,
                              style: entry.style,
                              weight: entry.weight,
                              display: entry.display,
                          },
                      ]
                    : [],
            ),
        ),
        owner: {
            kind: "contribution",
            contributionId: release.collectionId,
            ...(themeTokenImports.length ? { tokenImports: themeTokenImports } : {}),
        },
        categories: release.theme.categories.map((category) => ({
            id: category.id,
            label: resolveCollectionTranslation(release, category.label, locale),
            description: category.description
                ? resolveCollectionTranslation(release, category.description, locale)
                : "",
            tokens: category.entries.flatMap((entry) =>
                entry.type === "font-face"
                    ? []
                    : [
                          {
                              id: collectionThemeTokenId(release.collectionId, entry.id),
                              variable: collectionThemeTokenId(release.collectionId, entry.id),
                              label: resolveCollectionTranslation(release, entry.label, locale),
                              description: entry.description
                                  ? resolveCollectionTranslation(release, entry.description, locale)
                                  : "",
                              type: entry.type,
                              defaults: { ...entry.defaults },
                          },
                      ],
            ),
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
            .filter((source) => source.owner?.kind === "contribution")
            .flatMap((source) => source.categories.flatMap((category) => category.tokens.map((token) => token.id))),
    );
    next.sources = [...next.sources.filter((source) => source.owner?.kind !== "contribution"), ...sources];
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
