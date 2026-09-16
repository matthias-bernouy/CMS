import type { ThemeSettings } from "@bernouy/cms-content";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import type { LibraryCollection } from "cms-control/core/content/blocLibrary/types";
import { collectionWorkspacePath } from "../routes";
import { relatedThemeTokens } from "../themeRelations";
import {
    collectionThemeProviderLabel,
    resolveCollectionThemeSources,
    type CollectionThemeSource,
} from "../themeSources";
import type {
    CollectionThemeDetailView,
    CollectionThemeNavigationCategoryView,
    CollectionThemeSummaryView,
    CollectionThemeTokenView,
} from "../types";
import { themeSpecimen } from "./specimen";
import { collectionThemeCategories, projectThemeToken, type RawThemeCategory, siteThemeCategories } from "./catalog";

export type CollectionThemeProjection = {
    summary: CollectionThemeSummaryView;
    detail?: CollectionThemeDetailView;
};

export function collectionThemeProjection(
    collection: LibraryCollection,
    installations: readonly IntegrationInstallation[],
    settings: ThemeSettings | undefined,
    requestedToken: string | undefined,
    requestedTheme: string | undefined,
    basePath: string,
): CollectionThemeProjection {
    const resolvedSources = resolveCollectionThemeSources(collection, installations);
    const { own, dependencies, sources } = resolvedSources;
    const collectionCategories = collectionThemeCategories(sources);
    const tokenCount = collectionCategories.reduce((count, category) => count + category.tokens.length, 0);
    const inherited = sources.filter(({ inherited }) => inherited);
    const providerLabel = collectionThemeProviderLabel(resolvedSources, collection);
    const ownHasTokens = Boolean(own?.theme?.categories.length);
    const mode = ownHasTokens ? (inherited.length ? "extended" : "declared") : "inherited";
    const summary: CollectionThemeSummaryView = {
        mode,
        statusLabel:
            mode === "declared"
                ? `Defined by ${own?.label ?? collection.name}`
                : mode === "extended"
                  ? `Extends ${providerLabel}`
                  : `Inherited from ${providerLabel}`,
        description:
            mode === "inherited"
                ? `${collection.name} uses the shared ${providerLabel} theme contract without declaring collection-specific tokens.`
                : mode === "extended"
                  ? `${collection.name} keeps the ${providerLabel} contract and adds its own collection tokens.`
                  : `${collection.name} declares the theme contract used by its blocs.`,
        providerLabel,
        ...(dependencies[0]?.versionRange ? { dependencyRange: dependencies[0].versionRange } : {}),
        categoryCount: collectionCategories.length,
        tokenCount,
    };
    return {
        summary,
        ...(settings
            ? {
                  detail: themeDetail(
                      [...siteThemeCategories(settings), ...collectionCategories],
                      sources,
                      settings,
                      requestedToken,
                      requestedTheme,
                      collection,
                      basePath,
                  ),
              }
            : {}),
    };
}

function themeDetail(
    rawCategories: RawThemeCategory[],
    sources: CollectionThemeSource[],
    settings: ThemeSettings,
    requestedToken: string | undefined,
    requestedTheme: string | undefined,
    collection: LibraryCollection,
    basePath: string,
): CollectionThemeDetailView {
    const rawTokens = rawCategories.flatMap(({ tokens }) => tokens);
    const selectedVariable = rawTokens.some(({ variable }) => variable === requestedToken) ? requestedToken : undefined;
    const selectedTheme =
        settings.themes.find(({ id }) => id === requestedTheme) ??
        settings.themes.find(({ id }) => id === settings.activeThemeId) ??
        settings.themes[0];
    const selectedThemeId = selectedTheme?.id ?? "";
    const selectedThemeQuery = selectedThemeId === settings.activeThemeId ? undefined : selectedThemeId;
    const tokenViews = rawTokens.map((rawToken) => projectThemeToken(rawToken, settings, selectedThemeId));
    const token = tokenViews.find(({ variable }) => variable === selectedVariable);
    const themePath = collectionWorkspacePath(basePath, collection.key, "theme");
    const categories = rawCategories.map((category) =>
        navigationCategory(category, selectedVariable, selectedThemeQuery, themePath),
    );
    const category = categories.find(({ current }) => current);
    const navigation = new Map(
        categories.flatMap(({ tokens }) => tokens.map(({ variable, label, href }) => [variable, { label, href }])),
    );
    const relatedTokens = token ? relatedThemeTokens(token, tokenViews, navigation) : [];
    return {
        overview: !token,
        overviewHref: themeUrl(themePath, selectedThemeQuery),
        navigationLabel: token?.label ?? "Overview",
        categories,
        ...(category
            ? {
                  category: {
                      id: category.id,
                      label: category.label,
                      description: category.description,
                      siteOwned: category.siteOwned,
                  },
              }
            : {}),
        ...(token ? { token } : {}),
        relatedTokens,
        profile: {
            selectedThemeId,
            selectedThemeName: selectedTheme?.name ?? "Theme",
            active: selectedThemeId === settings.activeThemeId,
            themes: settings.themes.map(({ id, name }) => ({ id, name })),
        },
        specimen: themeSpecimen(
            sources,
            token ? tokenViews : tokenViews.filter(({ catalogEditable }) => !catalogEditable),
            token,
            relatedTokens,
        ),
    };
}

function navigationCategory(
    category: RawThemeCategory,
    selectedVariable: string | undefined,
    selectedThemeId: string | undefined,
    themePath: string,
): CollectionThemeNavigationCategoryView {
    const labelCounts = new Map<string, number>();
    for (const token of category.tokens) {
        labelCounts.set(token.label, (labelCounts.get(token.label) ?? 0) + 1);
    }
    const tokens = category.tokens.map((token) => ({
        variable: token.variable,
        label: token.label,
        navigationLabel: labelCounts.get(token.label) === 1 ? token.label : `${token.label} · ${token.sourceLabel}`,
        href: themeUrl(themePath, selectedThemeId, token.variable),
        current: token.variable === selectedVariable,
    }));
    return {
        id: category.id,
        label: category.label,
        navigationLabel: category.siteOwned ? `Site · ${category.label}` : category.label,
        description: category.description,
        siteOwned: category.siteOwned,
        tokens,
        tokenCount: tokens.length,
        current: tokens.some(({ current }) => current),
    };
}

function themeUrl(path: string, theme?: string, token?: string): string {
    const query = new URLSearchParams();
    if (theme) {
        query.set("theme", theme);
    }
    if (token) {
        query.set("token", token);
    }
    const suffix = query.toString();
    return suffix ? `${path}?${suffix}` : path;
}
