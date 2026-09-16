import type { ThemeSettings, ThemeTokenDefaults } from "@bernouy/cms-content";
import type { IntegrationThemeCategory } from "@bernouy/cms-integrations";
import type { CollectionThemeSource } from "../themeSources";
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

export function collectionThemeCategories(sources: CollectionThemeSource[]): RawThemeCategory[] {
    const categories = new Map<string, RawThemeCategory>();
    for (const source of sources) {
        for (const category of source.definition.theme?.categories ?? []) {
            const current = categories.get(category.id);
            const tokens = integrationTokens(category, source);
            if (!current) {
                categories.set(category.id, {
                    id: category.id,
                    label: category.label,
                    description: category.description ?? "",
                    siteOwned: false,
                    tokens,
                });
            } else {
                current.tokens.push(...tokens);
                if (!source.inherited) {
                    current.label = category.label;
                    current.description = category.description ?? current.description;
                }
            }
        }
    }
    return [...categories.values()];
}

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

function integrationTokens(category: IntegrationThemeCategory, source: CollectionThemeSource): RawThemeToken[] {
    return category.tokens.map((token) => ({
        id: token.id,
        variable: `${source.integrationId}-${token.id}`,
        label: token.label,
        description: token.description ?? "",
        type: token.type,
        sourceLabel: source.label,
        sourceDescription: source.inherited ? `Inherited from ${source.label}` : `Defined by ${source.label}`,
        inherited: source.inherited,
        catalogEditable: false,
        sourceId: `integration-${source.integrationId}`,
        categoryId: category.id,
        defaults: token.defaults,
    }));
}
