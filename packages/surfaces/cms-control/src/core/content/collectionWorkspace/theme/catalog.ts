import type { ThemeSettings, ThemeTokenDefaults } from "@bernouy/cms-content";
import { projectThemeValues } from "../themeValues";
import type { CollectionThemeTokenView } from "../types";

export type RawThemeCategory = {
    id: string;
    label: string;
    description: string;
    siteOwned: boolean;
    tokens: RawThemeToken[];
};

export type RawThemeToken = Omit<CollectionThemeTokenView, keyof ReturnType<typeof projectThemeValues>> & {
    defaults: ThemeTokenDefaults;
};

export function siteThemeCategories(settings: ThemeSettings): RawThemeCategory[] {
    return settings.sources.flatMap((source) => {
        if (source.owner) {
            return [];
        }
        return source.categories.flatMap((category) =>
            category.tokens.length
                ? [
                      {
                          id: `${source.id}:${category.id}`,
                          label: category.label,
                          description: category.description,
                          siteOwned: true,
                          tokens: category.tokens.map((token) => ({
                              id: token.id,
                              variable: token.variable,
                              label: token.label,
                              description: token.description,
                              type: token.type,
                              sourceLabel: source.label,
                              sourceDescription: "Defined by this site",
                              inherited: false,
                              catalogEditable: true,
                              sourceId: source.id,
                              categoryId: category.id,
                              defaults: token.defaults ?? {},
                          })),
                      },
                  ]
                : [],
        );
    });
}

export function projectThemeToken(
    token: RawThemeToken,
    settings: ThemeSettings,
    selectedThemeId: string,
): CollectionThemeTokenView {
    const { defaults, ...metadata } = token;
    return { ...metadata, ...projectThemeValues(settings, token.variable, defaults, selectedThemeId) };
}
